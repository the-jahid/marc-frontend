import { jsonError, syncAndPersistEntry } from "@/lib/knowledgebase-api";
import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/lib/knowledgebase-db";
import { deleteKnowledgeEntryVectors } from "@/lib/knowledgebase-vector";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const entryId = await parseEntryId(context);

  if (entryId === null) {
    return jsonError(400, "A numeric entry id is required");
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title || !content) {
    return jsonError(400, "Both title and content are required");
  }

  const entry = await updateKnowledgeEntry(entryId, title, content);

  if (!entry) {
    return jsonError(404, `Knowledge entry ${entryId} not found`);
  }

  return Response.json(await syncAndPersistEntry(entry));
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const entryId = await parseEntryId(context);

  if (entryId === null) {
    return jsonError(400, "A numeric entry id is required");
  }

  const deleted = await deleteKnowledgeEntry(entryId);

  if (!deleted) {
    return jsonError(404, `Knowledge entry ${entryId} not found`);
  }

  await deleteKnowledgeEntryVectors(entryId).catch(() => undefined);

  return Response.json({ deleted });
}

async function parseEntryId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const entryId = Number(id);

  return Number.isInteger(entryId) ? entryId : null;
}
