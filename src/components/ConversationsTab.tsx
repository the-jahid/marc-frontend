"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_BASE_URL,
  apiFetch,
  formatTime,
  type ConversationMessage,
  type ConversationSummary,
} from "@/lib/api";

export default function ConversationsTab() {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await apiFetch<ConversationSummary[]>("/conversations");
      setConversations(data);
      setError(null);
    } catch {
      setError(
        `Could not reach the API at ${API_BASE_URL}. Is the server running?`,
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const fetchMessages = useCallback(async (phoneNumber: string) => {
    try {
      const data = await apiFetch<ConversationMessage[]>(
        `/conversations/${encodeURIComponent(phoneNumber)}/messages`,
      );
      setMessages(data);
    } catch {
      // Keep the previous messages visible if a refresh fails.
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchConversations();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchConversations();
    }, 10_000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedPhone) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLoadingMessages(true);
      setMessages([]);
      void fetchMessages(selectedPhone);
    }, 0);
    const interval = window.setInterval(() => {
      void fetchMessages(selectedPhone);
    }, 5_000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredConversations = conversations.filter((conversation) =>
    conversation.phoneNumber.includes(search.trim()),
  );

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Sidebar */}
      <aside className="flex w-full max-w-xs flex-col border-r border-zinc-200 dark:border-zinc-800 sm:max-w-sm">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search phone number…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
              Loading conversations…
            </p>
          )}

          {error && !loadingList && (
            <p className="p-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {!loadingList && !error && filteredConversations.length === 0 && (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
              {conversations.length === 0
                ? "No conversations yet."
                : "No phone number matches your search."}
            </p>
          )}

          {filteredConversations.map((conversation) => {
            const isSelected = conversation.phoneNumber === selectedPhone;
            return (
              <button
                key={conversation.phoneNumber}
                onClick={() => setSelectedPhone(conversation.phoneNumber)}
                className={`flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors dark:border-zinc-800/60 ${
                  isSelected
                    ? "bg-emerald-50 dark:bg-emerald-500/10"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
                  {conversation.phoneNumber.slice(-2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      +{conversation.phoneNumber.replace(/^\+/, "")}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {formatTime(conversation.lastActivityAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {conversation.lastRole === "ASSISTANT" && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Bot:{" "}
                        </span>
                      )}
                      {conversation.lastMessage}
                    </span>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {conversation.messageCount}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat panel */}
      <section className="flex min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950/40">
        {!selectedPhone ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <svg
                className="h-7 w-7 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a conversation to view its messages.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
                {selectedPhone.slice(-2)}
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                  +{selectedPhone.replace(/^\+/, "")}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {messages.length} messages
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {loadingMessages && messages.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Loading messages…
                </p>
              )}

              {messages.map((message) => {
                const isUser = message.role === "USER";
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                        isUser
                          ? "rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          : "rounded-br-md bg-linear-to-br from-emerald-600 to-teal-700 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
                        {message.content}
                      </p>
                      <p
                        className={`mt-1 text-right text-[10px] ${
                          isUser
                            ? "text-zinc-400"
                            : "text-emerald-100/80"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
