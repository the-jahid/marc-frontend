import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { OfficeParser, type SupportedFileType } from "officeparser";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SUPPORTED_OFFICE_TYPES = new Set<SupportedFileType>([
  "docx",
  "pptx",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "pdf",
  "rtf",
  "csv",
  "md",
  "html",
]);
const OCR_FALLBACK_TYPES = new Set<SupportedFileType>([
  "docx",
  "pptx",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "pdf",
  "rtf",
]);

export type UploadedDocument = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export class DocumentExtractionError extends Error {}

type ExtractionAttempt = {
  label: string;
  extract: () => Promise<string>;
};

export async function extractDocumentText(
  file: UploadedDocument,
): Promise<string> {
  const fileName = file.fileName.toLowerCase();
  const mimeType = file.mimeType.toLowerCase();
  const officeFileType = getOfficeFileType(fileName);

  if (isPdfFile(fileName, mimeType, officeFileType)) {
    return extractPdfDocument(file.buffer);
  }

  if (isDocxFile(fileName, mimeType, officeFileType)) {
    return extractDocxDocument(file.buffer);
  }

  if (officeFileType) {
    return extractOfficeDocument(file.buffer, officeFileType);
  }

  return ensureExtractedText(extractPlainText(file.buffer));
}

async function extractPdfDocument(buffer: Buffer): Promise<string> {
  return extractFirstReadableText(
    [
      {
        label: "PDF text layer",
        extract: () => extractPdfText(buffer),
      },
      {
        label: "Office PDF parser",
        extract: () => extractOfficeParserText(buffer, "pdf"),
      },
      {
        label: "PDF OCR",
        extract: () => extractOfficeParserText(buffer, "pdf", { useOcr: true }),
      },
    ],
    "No readable text could be extracted from this PDF. If it is scanned or image-only, OCR did not find text.",
    "Could not extract text from PDF file",
  );
}

async function extractDocxDocument(buffer: Buffer): Promise<string> {
  return extractFirstReadableText(
    [
      {
        label: "DOCX text",
        extract: () => extractDocxText(buffer),
      },
      {
        label: "Office DOCX parser",
        extract: () => extractOfficeParserText(buffer, "docx"),
      },
      {
        label: "DOCX OCR",
        extract: () =>
          extractOfficeParserText(buffer, "docx", { useOcr: true }),
      },
    ],
    "No readable text could be extracted from this DOCX document. If it only contains images, OCR did not find text.",
    "Could not extract text from DOCX file",
  );
}

async function extractOfficeDocument(
  buffer: Buffer,
  fileType: SupportedFileType,
): Promise<string> {
  const attempts: ExtractionAttempt[] = [
    {
      label: `${fileType.toUpperCase()} parser`,
      extract: () => extractOfficeParserText(buffer, fileType),
    },
  ];

  if (OCR_FALLBACK_TYPES.has(fileType)) {
    attempts.push({
      label: `${fileType.toUpperCase()} OCR`,
      extract: () => extractOfficeParserText(buffer, fileType, { useOcr: true }),
    });
  }

  return extractFirstReadableText(
    attempts,
    `No readable text could be extracted from this ${fileType.toUpperCase()} document.`,
    `Could not extract text from ${fileType.toUpperCase()} file`,
  );
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText({
      pageJoiner: "\n\n",
      parseHyperlinks: true,
    });

    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });

  return result.value;
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf8").split(String.fromCharCode(0)).join("");
}

async function extractOfficeParserText(
  buffer: Buffer,
  fileType: SupportedFileType,
  options: { useOcr?: boolean } = {},
): Promise<string> {
  const useOcr = options.useOcr === true;
  const ast = await OfficeParser.parseOffice(buffer, {
    fileType,
    newlineDelimiter: "\n",
    ignoreComments: true,
    ignoreHeadersAndFooters: true,
    ignoreInternalLinks: true,
    ignoreSlideMasters: true,
    extractAttachments: useOcr,
    ocr: useOcr,
    ocrConfig: useOcr
      ? {
          language: "eng",
          timeout: {
            autoTerminate: 1000,
          },
        }
      : undefined,
  });

  return ast.toText();
}

async function extractFirstReadableText(
  attempts: ExtractionAttempt[],
  emptyMessage: string,
  errorPrefix: string,
): Promise<string> {
  let firstError: string | null = null;

  for (const attempt of attempts) {
    try {
      const normalized = normalizeExtractedText(await attempt.extract());

      if (normalized) {
        return normalized;
      }
    } catch (error) {
      firstError ??= `${attempt.label}: ${errorToMessage(error)}`;
    }
  }

  if (firstError) {
    throw new DocumentExtractionError(`${errorPrefix}: ${firstError}`);
  }

  throw new DocumentExtractionError(emptyMessage);
}

function getOfficeFileType(fileName: string): SupportedFileType | null {
  const extension = fileName.split(".").pop();

  if (
    !extension ||
    !SUPPORTED_OFFICE_TYPES.has(extension as SupportedFileType)
  ) {
    return null;
  }

  return extension as SupportedFileType;
}

function isPdfFile(
  fileName: string,
  mimeType: string,
  fileType: SupportedFileType | null,
): boolean {
  return (
    fileType === "pdf" || mimeType.includes("pdf") || fileName.endsWith(".pdf")
  );
}

function isDocxFile(
  fileName: string,
  mimeType: string,
  fileType: SupportedFileType | null,
): boolean {
  return (
    fileType === "docx" ||
    mimeType === DOCX_MIME_TYPE ||
    fileName.endsWith(".docx")
  );
}

function normalizeExtractedText(text: string): string | null {
  const normalized = text
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return normalized || null;
}

function ensureExtractedText(text: string): string {
  const normalized = normalizeExtractedText(text);

  if (!normalized) {
    throw new DocumentExtractionError(
      "No readable text could be extracted from this file",
    );
  }

  return normalized;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
