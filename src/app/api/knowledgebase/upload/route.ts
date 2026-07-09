import {
  DocumentExtractionError,
  extractDocumentText,
} from "@/lib/document-text";
import { jsonError, syncAndPersistEntry } from "@/lib/knowledgebase-api";
import { createKnowledgeDocumentEntry } from "@/lib/knowledgebase-db";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const title = formData?.get("title");

  if (!(file instanceof File)) {
    return jsonError(400, "A document file is required");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(400, "File is too large (max 25 MB)");
  }

  let content: string;

  try {
    content = await extractDocumentText({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      return jsonError(400, error.message);
    }

    throw error;
  }

  const entry = await createKnowledgeDocumentEntry({
    title: typeof title === "string" && title.trim() ? title.trim() : file.name,
    content,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
  });

  return Response.json(await syncAndPersistEntry(entry));
}
