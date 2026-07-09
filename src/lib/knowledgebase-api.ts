import type { KnowledgeEntry } from "@/lib/api";
import { setKnowledgeVectorState } from "@/lib/knowledgebase-db";
import {
  type KnowledgeVectorSyncResult,
  syncKnowledgeEntryVectors,
} from "@/lib/knowledgebase-vector";

export function jsonError(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

export async function syncUnindexedEntries(
  entries: KnowledgeEntry[],
): Promise<KnowledgeEntry[]> {
  const syncedEntries: KnowledgeEntry[] = [];

  for (const entry of entries) {
    if (entry.vectorStatus === "indexed") {
      syncedEntries.push(entry);
    } else {
      syncedEntries.push(await syncAndPersistEntry(entry));
    }
  }

  return syncedEntries;
}

export async function syncAndPersistEntry(
  entry: KnowledgeEntry,
): Promise<KnowledgeEntry> {
  const result = await syncKnowledgeEntryVectors(entry);

  return persistVectorState(entry, result);
}

async function persistVectorState(
  entry: KnowledgeEntry,
  result: KnowledgeVectorSyncResult,
): Promise<KnowledgeEntry> {
  const persisted = await setKnowledgeVectorState(entry.id, {
    chunkCount: result.chunkCount,
    vectorError: result.error,
    vectorStatus: result.status,
  }).catch(() => null);

  return (
    persisted ?? {
      ...entry,
      chunkCount: result.chunkCount,
      vectorError: result.error,
      vectorStatus: result.status,
    }
  );
}
