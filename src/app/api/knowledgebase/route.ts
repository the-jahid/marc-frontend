import {
  jsonError,
  syncAndPersistEntry,
  syncUnindexedEntries,
} from "@/lib/knowledgebase-api";
import {
  createKnowledgeEntry,
  listKnowledgeEntries,
} from "@/lib/knowledgebase-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const entries = await listKnowledgeEntries();

  return Response.json(await syncUnindexedEntries(entries));
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title || !content) {
    return jsonError(400, "Both title and content are required");
  }

  const entry = await createKnowledgeEntry(title, content);

  return Response.json(await syncAndPersistEntry(entry));
}
