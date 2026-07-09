"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_BASE_URL,
  apiFetch,
  formatDateTime,
  type KnowledgeEntry,
} from "@/lib/api";

type EditorState = {
  id: number | null;
  title: string;
  content: string;
};

const EMPTY_EDITOR: EditorState = { id: null, title: "", content: "" };

export default function KnowledgebaseTab() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const data = await apiFetch<KnowledgeEntry[]>("/knowledgebase");
      setEntries(data);
      setError(null);
    } catch {
      setError(
        `Could not reach the API at ${API_BASE_URL}. Is the server running?`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchEntries();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [fetchEntries]);

  const saveEntry = async () => {
    if (!editor || !editor.title.trim() || !editor.content.trim()) {
      return;
    }

    setSaving(true);
    try {
      if (editor.id === null) {
        await apiFetch<KnowledgeEntry>("/knowledgebase", {
          method: "POST",
          body: JSON.stringify({
            title: editor.title,
            content: editor.content,
          }),
        });
      } else {
        await apiFetch<KnowledgeEntry>(`/knowledgebase/${editor.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: editor.title,
            content: editor.content,
          }),
        });
      }

      setEditor(null);
      await fetchEntries();
    } catch {
      setError("Saving the entry failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async () => {
    if (!uploadFile) {
      return;
    }

    const formData = new FormData();
    formData.set("file", uploadFile);

    if (uploadTitle.trim()) {
      formData.set("title", uploadTitle.trim());
    }

    setUploading(true);
    try {
      await apiFetch<KnowledgeEntry>("/knowledgebase/upload", {
        method: "POST",
        body: formData,
      });
      setUploadTitle("");
      setUploadFile(null);
      await fetchEntries();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? `Uploading the document failed. ${uploadError.message}`
          : "Uploading the document failed. Check that it contains readable text.",
      );
    } finally {
      setUploading(false);
    }
  };

  const deleteEntry = async (id: number) => {
    if (!window.confirm("Delete this knowledge entry?")) {
      return;
    }

    try {
      await apiFetch<{ deleted: boolean }>(`/knowledgebase/${id}`, {
        method: "DELETE",
      });
      await fetchEntries();
    } catch {
      setError("Deleting the entry failed. Please try again.");
    }
  };

  return (
    <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Knowledgebase
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Facts and documents the assistant uses when replying on WhatsApp.
          </p>
        </div>
        <button
          onClick={() => setEditor({ ...EMPTY_EDITOR })}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Add entry
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Upload document
            </label>
            <input
              type="file"
              onChange={(event) =>
                setUploadFile(event.target.files?.[0] ?? null)
              }
              className="mt-2 block w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:file:bg-zinc-700 dark:file:text-zinc-100"
            />
          </div>
          <div className="min-w-52 flex-1">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Title
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder="Optional display title"
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <button
            onClick={uploadDocument}
            disabled={uploading || !uploadFile}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          PDF, DOCX, PPTX, XLSX, RTF, Markdown, CSV, JSON, HTML, and other
          text-readable files are extracted, chunked, embedded, and synced to
          Pinecone.
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      {editor && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {editor.id === null ? "New entry" : "Edit entry"}
          </h3>
          <input
            type="text"
            value={editor.title}
            onChange={(event) =>
              setEditor({ ...editor, title: event.target.value })
            }
            placeholder="Title - e.g. Opening hours"
            className="mt-4 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <textarea
            value={editor.content}
            onChange={(event) =>
              setEditor({ ...editor, content: event.target.value })
            }
            placeholder="Content the assistant should know..."
            rows={6}
            className="mt-3 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={() => setEditor(null)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={saveEntry}
              disabled={saving || !editor.title.trim() || !editor.content.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save entry"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3 pb-8">
        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading entries...
          </p>
        )}

        {!loading && !error && entries.length === 0 && !editor && (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              No knowledge entries yet
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Add facts or upload documents so the assistant can answer with
              them.
            </p>
          </div>
        )}

        {entries.map((entry) => (
          <article
            key={entry.id}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  {entry.title}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {entry.sourceType === "document" && entry.fileName
                    ? entry.fileName
                    : "Manual entry"}{" "}
                  | Updated {formatDateTime(entry.updatedAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.vectorStatus === "indexed"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : entry.vectorStatus === "failed"
                          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                    title={entry.vectorError ?? undefined}
                  >
                    {formatVectorStatus(entry)}
                  </span>
                  {entry.sourceType === "document" && entry.byteSize && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {formatFileSize(entry.byteSize)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() =>
                    setEditor({
                      id: entry.id,
                      title: entry.title,
                      content: entry.content,
                    })
                  }
                  title="Edit"
                  className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  title="Delete"
                  className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 line-clamp-3 dark:text-zinc-400">
              {entry.content}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatVectorStatus(entry: KnowledgeEntry): string {
  if (entry.vectorStatus === "indexed") {
    return `Indexed | ${entry.chunkCount} chunks`;
  }

  if (entry.vectorStatus === "not_configured") {
    const vectorError = entry.vectorError?.toLowerCase() ?? "";

    if (vectorError.includes("openai")) {
      return "OpenAI not configured";
    }

    if (vectorError.includes("pinecone")) {
      return "Pinecone not configured";
    }

    return "Vector search not configured";
  }

  if (entry.vectorStatus === "failed") {
    return "Indexing failed";
  }

  return "Indexing";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
