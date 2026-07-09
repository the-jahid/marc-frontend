import { Pool } from "pg";
import type { KnowledgeEntry } from "@/lib/api";

const MAX_VECTOR_ERROR_CHARS = 1000;

const KNOWLEDGE_ENTRY_SELECT = `
  id,
  title,
  content,
  "sourceType",
  "fileName",
  "mimeType",
  "byteSize",
  "chunkCount",
  "vectorStatus",
  "vectorError",
  "vectorRevision",
  "createdAt",
  "updatedAt"
`;

export type KnowledgeVectorState = Pick<
  KnowledgeEntry,
  "chunkCount" | "vectorStatus" | "vectorError"
>;

type KnowledgeDocumentInput = {
  title: string;
  content: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

type KnowledgeEntryRow = Omit<KnowledgeEntry, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

// Stashed on globalThis so dev-server module reloads reuse the same pool
// and table setup instead of leaking connections.
const globalStore = globalThis as typeof globalThis & {
  __knowledgebasePgPool?: Pool;
  __knowledgebaseStorageReady?: Promise<void>;
};

function getPool(): Pool {
  if (globalStore.__knowledgebasePgPool) {
    return globalStore.__knowledgebasePgPool;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "Set DATABASE_URL in frontend/.env to enable knowledgebase storage.",
    );
  }

  globalStore.__knowledgebasePgPool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  return globalStore.__knowledgebasePgPool;
}

async function ensureStorage(): Promise<Pool> {
  const pool = getPool();

  globalStore.__knowledgebaseStorageReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "KnowledgeEntry" (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        "sourceType" TEXT NOT NULL DEFAULT 'text',
        "fileName" TEXT,
        "mimeType" TEXT,
        "byteSize" INTEGER,
        "chunkCount" INTEGER NOT NULL DEFAULT 0,
        "vectorStatus" TEXT NOT NULL DEFAULT 'pending',
        "vectorError" TEXT,
        "vectorRevision" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      ALTER TABLE "KnowledgeEntry"
      ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS "fileName" TEXT,
      ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
      ADD COLUMN IF NOT EXISTS "byteSize" INTEGER,
      ADD COLUMN IF NOT EXISTS "chunkCount" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "vectorStatus" TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "vectorError" TEXT,
      ADD COLUMN IF NOT EXISTS "vectorRevision" INTEGER NOT NULL DEFAULT 1;
    `);
  })().catch((error: unknown) => {
    globalStore.__knowledgebaseStorageReady = undefined;
    throw error;
  });

  await globalStore.__knowledgebaseStorageReady;

  return pool;
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const pool = await ensureStorage();
  const result = await pool.query<KnowledgeEntryRow>(`
    SELECT ${KNOWLEDGE_ENTRY_SELECT}
    FROM "KnowledgeEntry"
    ORDER BY id DESC
  `);

  return result.rows.map(toEntry);
}

export async function createKnowledgeEntry(
  title: string,
  content: string,
): Promise<KnowledgeEntry> {
  const pool = await ensureStorage();
  const result = await pool.query<KnowledgeEntryRow>(
    `
      INSERT INTO "KnowledgeEntry" (
        title,
        content,
        "sourceType",
        "vectorStatus"
      )
      VALUES ($1, $2, 'text', 'pending')
      RETURNING ${KNOWLEDGE_ENTRY_SELECT}
    `,
    [title, content],
  );

  return toEntry(result.rows[0]);
}

export async function createKnowledgeDocumentEntry(
  input: KnowledgeDocumentInput,
): Promise<KnowledgeEntry> {
  const pool = await ensureStorage();
  const result = await pool.query<KnowledgeEntryRow>(
    `
      INSERT INTO "KnowledgeEntry" (
        title,
        content,
        "sourceType",
        "fileName",
        "mimeType",
        "byteSize",
        "vectorStatus"
      )
      VALUES ($1, $2, 'document', $3, $4, $5, 'pending')
      RETURNING ${KNOWLEDGE_ENTRY_SELECT}
    `,
    [input.title, input.content, input.fileName, input.mimeType, input.byteSize],
  );

  return toEntry(result.rows[0]);
}

export async function updateKnowledgeEntry(
  id: number,
  title: string,
  content: string,
): Promise<KnowledgeEntry | null> {
  const pool = await ensureStorage();
  const result = await pool.query<KnowledgeEntryRow>(
    `
      UPDATE "KnowledgeEntry"
      SET
        title = $2,
        content = $3,
        "chunkCount" = 0,
        "vectorStatus" = 'pending',
        "vectorError" = NULL,
        "vectorRevision" = "vectorRevision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${KNOWLEDGE_ENTRY_SELECT}
    `,
    [id, title, content],
  );
  const row = result.rows[0];

  return row ? toEntry(row) : null;
}

export async function deleteKnowledgeEntry(id: number): Promise<boolean> {
  const pool = await ensureStorage();
  const result = await pool.query(
    `DELETE FROM "KnowledgeEntry" WHERE id = $1`,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function setKnowledgeVectorState(
  id: number,
  state: KnowledgeVectorState,
): Promise<KnowledgeEntry | null> {
  const pool = await ensureStorage();
  const result = await pool.query<KnowledgeEntryRow>(
    `
      UPDATE "KnowledgeEntry"
      SET
        "chunkCount" = $2,
        "vectorStatus" = $3,
        "vectorError" = $4
      WHERE id = $1
      RETURNING ${KNOWLEDGE_ENTRY_SELECT}
    `,
    [
      id,
      state.chunkCount,
      state.vectorStatus,
      state.vectorError?.slice(0, MAX_VECTOR_ERROR_CHARS) ?? null,
    ],
  );
  const row = result.rows[0];

  return row ? toEntry(row) : null;
}

function toEntry(row: KnowledgeEntryRow): KnowledgeEntry {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
