import {
  Errors,
  Pinecone,
  type Index,
  type PineconeRecord,
  type RecordMetadata,
} from "@pinecone-database/pinecone";
import type { KnowledgeEntry } from "@/lib/api";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_NAMESPACE = "knowledgebase";
const DEFAULT_CHUNK_CHARS = 1400;
const DEFAULT_CHUNK_OVERLAP_CHARS = 180;
const MAX_VECTOR_ERROR_CHARS = 1000;

type KnowledgeVectorMetadata = RecordMetadata & {
  entryId: number;
  vectorRevision: number;
  chunkIndex: number;
  title: string;
  text: string;
  sourceType: string;
  fileName: string;
  mimeType: string;
};

export type KnowledgeVectorSyncResult = {
  status: "indexed" | "not_configured" | "failed";
  chunkCount: number;
  error: string | null;
};

type VectorConfig = {
  openAiApiKey: string;
  openAiBaseUrl: string;
  pineconeApiKey: string;
  pineconeIndexName: string | null;
  pineconeIndexHost: string | null;
  namespace: string;
  embeddingModel: string;
  embeddingDimensions: number | undefined;
};

type VectorClients = {
  index: Index<KnowledgeVectorMetadata>;
  config: VectorConfig;
};

let cachedClients: VectorClients | null = null;
let cachedClientKey: string | null = null;

export async function syncKnowledgeEntryVectors(
  entry: KnowledgeEntry,
): Promise<KnowledgeVectorSyncResult> {
  const clients = getClients();

  if (!clients) {
    return {
      status: "not_configured",
      chunkCount: 0,
      error:
        "Set OPENAI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX or PINECONE_INDEX_HOST in frontend/.env to enable vector search.",
    };
  }

  const chunks = chunkText(entry.content);

  if (chunks.length === 0) {
    return { status: "failed", chunkCount: 0, error: "No text to index" };
  }

  try {
    await deleteKnowledgeEntryVectors(entry.id);

    for (let start = 0; start < chunks.length; start += 50) {
      const batch = chunks.slice(start, start + 50);
      const vectors = await embedTexts(batch, clients.config);
      const records: Array<PineconeRecord<KnowledgeVectorMetadata>> =
        batch.map((chunk, batchIndex) => {
          const chunkIndex = start + batchIndex;

          return {
            id: `kb:${entry.id}:${entry.vectorRevision}:${chunkIndex}`,
            values: vectors[batchIndex],
            metadata: {
              entryId: entry.id,
              vectorRevision: entry.vectorRevision,
              chunkIndex,
              title: entry.title,
              text: chunk,
              sourceType: entry.sourceType,
              fileName: entry.fileName ?? "",
              mimeType: entry.mimeType ?? "",
            },
          };
        });

      await clients.index.upsert({ records });
    }

    return { status: "indexed", chunkCount: chunks.length, error: null };
  } catch (error) {
    return {
      status: "failed",
      chunkCount: 0,
      error: errorToMessage(error).slice(0, MAX_VECTOR_ERROR_CHARS),
    };
  }
}

export async function deleteKnowledgeEntryVectors(
  entryId: number,
): Promise<void> {
  const clients = getClients();

  if (!clients) {
    return;
  }

  // Serverless indexes reject metadata-filter deletes, so list the record
  // ids by prefix and delete those instead.
  try {
    let paginationToken: string | undefined;

    do {
      const page = await clients.index.listPaginated({
        prefix: `kb:${entryId}:`,
        paginationToken,
      });
      const ids = (page.vectors ?? [])
        .map((vector) => vector.id)
        .filter((id): id is string => Boolean(id));

      if (ids.length > 0) {
        await clients.index.deleteMany({ ids });
      }

      paginationToken = page.pagination?.next;
    } while (paginationToken);
  } catch (error) {
    // A 404 means the namespace does not exist yet, so there is nothing
    // to delete.
    if (error instanceof Errors.PineconeNotFoundError) {
      return;
    }

    throw error;
  }
}

function getClients(): VectorClients | null {
  const config = getVectorConfig();

  if (!config) {
    return null;
  }

  const clientKey = JSON.stringify(config);

  if (cachedClients && cachedClientKey === clientKey) {
    return cachedClients;
  }

  const pinecone = new Pinecone({
    apiKey: config.pineconeApiKey,
  });
  const index = pinecone.index<KnowledgeVectorMetadata>({
    name: config.pineconeIndexName ?? undefined,
    host: config.pineconeIndexHost ?? undefined,
    namespace: config.namespace,
  });

  cachedClients = { index, config };
  cachedClientKey = clientKey;

  return cachedClients;
}

function getVectorConfig(): VectorConfig | null {
  const openAiApiKey = envValue("OPENAI_API_KEY", "OPENAI_EMBEDDING_API_KEY");
  const pineconeApiKey = envValue("PINECONE_API_KEY");
  const pineconeIndexName = envValue("PINECONE_INDEX_NAME", "PINECONE_INDEX");
  const pineconeIndexHost = envValue("PINECONE_INDEX_HOST");

  if (
    !openAiApiKey ||
    !pineconeApiKey ||
    (!pineconeIndexName && !pineconeIndexHost)
  ) {
    return null;
  }

  return {
    openAiApiKey,
    openAiBaseUrl: envValue("OPENAI_BASE_URL") || "https://api.openai.com/v1",
    pineconeApiKey,
    pineconeIndexName: pineconeIndexName || null,
    pineconeIndexHost: pineconeIndexHost || null,
    namespace: envValue("PINECONE_NAMESPACE") || DEFAULT_NAMESPACE,
    embeddingModel:
      envValue("OPENAI_EMBEDDING_MODEL", "EMBEDDING_MODEL") ||
      DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: getEmbeddingDimensions(),
  };
}

async function embedTexts(
  texts: string[],
  config: VectorConfig,
): Promise<number[][]> {
  const response = await fetch(`${config.openAiBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.openAiApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: config.embeddingModel,
      ...(config.embeddingDimensions
        ? { dimensions: config.embeddingDimensions }
        : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | {
        data?: Array<{ embedding: number[]; index: number }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(
      body?.error?.message ||
        `OpenAI embeddings request failed with status ${response.status}`,
    );
  }

  if (!body?.data?.length) {
    throw new Error("OpenAI embeddings response did not include vectors");
  }

  return body.data
    .toSorted((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

function chunkText(text: string): string[] {
  const chunkSize = getPositiveIntegerEnv(
    "KNOWLEDGEBASE_CHUNK_CHARS",
    DEFAULT_CHUNK_CHARS,
  );
  const overlap = Math.min(
    getPositiveIntegerEnv(
      "KNOWLEDGEBASE_CHUNK_OVERLAP_CHARS",
      DEFAULT_CHUNK_OVERLAP_CHARS,
    ),
    chunkSize - 1,
  );
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      end = findChunkBoundary(normalized, start, end);
    }

    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function findChunkBoundary(text: string, start: number, end: number): number {
  const minimumEnd = start + Math.floor((end - start) * 0.65);
  const paragraphBoundary = text.lastIndexOf("\n\n", end);

  if (paragraphBoundary >= minimumEnd) {
    return paragraphBoundary;
  }

  const sentenceBoundary = text.lastIndexOf(". ", end);

  if (sentenceBoundary >= minimumEnd) {
    return sentenceBoundary + 1;
  }

  const wordBoundary = text.lastIndexOf(" ", end);

  return wordBoundary >= minimumEnd ? wordBoundary : end;
}

function getEmbeddingDimensions(): number | undefined {
  const raw = envValue("OPENAI_EMBEDDING_DIMENSIONS", "EMBEDDING_DIMENSIONS");

  if (!raw) {
    return undefined;
  }

  const value = Number(raw);

  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function getPositiveIntegerEnv(key: string, fallback: number): number {
  const raw = envValue(key);
  const value = raw ? Number(raw) : NaN;

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function envValue(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
