export const API_BASE_URL = "/api";

export type ConversationSummary = {
  phoneNumber: string;
  lastMessage: string;
  lastRole: "USER" | "ASSISTANT";
  lastActivityAt: string;
  messageCount: number;
  needsHumanAttention: boolean;
  attentionReason: string | null;
};

export type ConversationMessage = {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  needsHumanAttention: boolean;
  attentionReason: string | null;
};

export type KnowledgeEntry = {
  id: number;
  title: string;
  content: string;
  sourceType: "text" | "document";
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  chunkCount: number;
  vectorStatus: "pending" | "indexed" | "not_configured" | "failed";
  vectorError: string | null;
  vectorRevision: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentConfig = {
  systemPrompt: string | null;
  model: string | null;
  updatedAt: string | null;
  effectiveSystemPrompt: string;
  effectiveModel: string;
};

export type AbandonedCheckoutConfig = {
  enabled: boolean;
  messageTemplate: string;
  delayMinutes: number;
  updatedAt: string | null;
  defaultMessageTemplate: string;
  infrastructureReady: boolean;
  pollMinutes: number;
  lookbackHours: number;
};

export type AbandonedCheckoutRunResult = {
  skipped: boolean;
  reason?: string;
  scanned: number;
  sent: number;
  skippedCompleted: number;
  skippedNoPhone: number;
  skippedNoRecoveryUrl: number;
  skippedAlreadySent: number;
  failed: number;
  durationMs: number;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request to ${path} failed with status ${response.status}`;

    if (response.headers.get("content-type")?.includes("application/json")) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const responseMessage = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message;

      if (responseMessage) {
        message = responseMessage;
      }
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
