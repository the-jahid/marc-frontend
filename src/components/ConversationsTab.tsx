"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  API_BASE_URL,
  apiFetch,
  formatTime,
  type ConversationMessage,
  type ConversationSummary,
} from "@/lib/api";

const BOTTOM_SCROLL_THRESHOLD_PX = 80;

function isNearBottom(element: HTMLDivElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    BOTTOM_SCROLL_THRESHOLD_PX
  );
}

function haveSameMessages(
  currentMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
) {
  return (
    currentMessages.length === nextMessages.length &&
    currentMessages.every((currentMessage, index) => {
      const nextMessage = nextMessages[index];

      return (
        currentMessage.id === nextMessage.id &&
        currentMessage.role === nextMessage.role &&
        currentMessage.content === nextMessage.content &&
        currentMessage.createdAt === nextMessage.createdAt &&
        currentMessage.needsHumanAttention ===
          nextMessage.needsHumanAttention &&
        currentMessage.attentionReason === nextMessage.attentionReason
      );
    })
  );
}

function AttentionIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.3 3.84 2.82 17a2 2 0 0 0 1.74 3h14.88a2 2 0 0 0 1.74-3L13.7 3.84a2 2 0 0 0-3.4 0Z"
      />
    </svg>
  );
}

export default function ConversationsTab() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatestMessageRef = useRef(true);
  const isOpeningConversationRef = useRef(false);
  const selectedPhoneRef = useRef<string | null>(null);

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
      if (selectedPhoneRef.current === phoneNumber) {
        setMessages((currentMessages) =>
          haveSameMessages(currentMessages, data) ? currentMessages : data,
        );
      }
    } catch {
      // Keep the previous messages visible if a refresh fails.
    } finally {
      if (selectedPhoneRef.current === phoneNumber) {
        setLoadingMessages(false);
      }
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

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;

    if (!container || messages.length === 0) {
      return;
    }

    // Jump straight to the newest message when the conversation first opens;
    // animating from the top would scroll through the whole history.
    if (isOpeningConversationRef.current) {
      isOpeningConversationRef.current = false;
      shouldFollowLatestMessageRef.current = true;
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      return;
    }

    if (!shouldFollowLatestMessageRef.current) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const filteredConversations = conversations.filter((conversation) =>
    conversation.phoneNumber.includes(search.trim()),
  );
  const attentionCount = conversations.filter(
    (conversation) => conversation.needsHumanAttention,
  ).length;
  const selectedConversation = conversations.find(
    (conversation) => conversation.phoneNumber === selectedPhone,
  );
  const latestMessage = messages[messages.length - 1];
  const selectedNeedsAttention =
    latestMessage?.needsHumanAttention ??
    selectedConversation?.needsHumanAttention ??
    false;
  const selectedAttentionReason =
    latestMessage?.attentionReason ?? selectedConversation?.attentionReason;

  const selectConversation = (phoneNumber: string) => {
    selectedPhoneRef.current = phoneNumber;
    shouldFollowLatestMessageRef.current = true;
    isOpeningConversationRef.current = true;
    setSelectedPhone(phoneNumber);
    setMessages([]);
    setLoadingMessages(true);
    setDraft("");
    setSendError(null);
  };

  const backToList = () => {
    selectedPhoneRef.current = null;
    setSelectedPhone(null);
    setMessages([]);
    setLoadingMessages(false);
    setSendError(null);
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;

    if (container) {
      shouldFollowLatestMessageRef.current = isNearBottom(container);
    }
  };

  const scrollToOldestMessage = () => {
    const container = messagesContainerRef.current;

    if (container) {
      shouldFollowLatestMessageRef.current = false;
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const phoneNumber = selectedPhone;
    const message = draft.trim();

    if (!phoneNumber || !message || sending) {
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const sentMessage = await apiFetch<ConversationMessage>(
        `/conversations/${encodeURIComponent(phoneNumber)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        },
      );

      if (selectedPhoneRef.current === phoneNumber) {
        setMessages((currentMessages) =>
          currentMessages.some((item) => item.id === sentMessage.id)
            ? currentMessages
            : [...currentMessages, sentMessage],
        );
        setConversations((currentConversations) =>
          currentConversations.map((conversation) =>
            conversation.phoneNumber === phoneNumber
              ? {
                  ...conversation,
                  needsHumanAttention: false,
                  attentionReason: null,
                }
              : conversation,
          ),
        );
        setDraft("");
      }

      void fetchConversations();
    } catch (sendRequestError) {
      if (selectedPhoneRef.current === phoneNumber) {
        setSendError(
          sendRequestError instanceof Error
            ? sendRequestError.message
            : "Could not send the WhatsApp message.",
        );
      }
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Sidebar */}
      <aside
        className={`${
          selectedPhone ? "hidden lg:flex" : "flex"
        } w-full flex-col border-r border-zinc-200 dark:border-zinc-800 lg:w-80 lg:shrink-0 xl:w-96`}
      >
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
          {attentionCount > 0 && (
            <div
              className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
              aria-live="polite"
            >
              <AttentionIcon />
              <span>
                {attentionCount}{" "}
                {attentionCount === 1
                  ? "conversation needs"
                  : "conversations need"}{" "}
                attention
              </span>
            </div>
          )}
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
                onClick={() => selectConversation(conversation.phoneNumber)}
                className={`flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors dark:border-zinc-800/60 ${
                  isSelected
                    ? "bg-emerald-50 dark:bg-emerald-500/10"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
                    {conversation.phoneNumber.slice(-2)}
                  </div>
                  {conversation.needsHumanAttention && (
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-amber-950 shadow-sm dark:border-zinc-900"
                      title="Human attention needed"
                    >
                      <AttentionIcon className="h-3 w-3" />
                      <span className="sr-only">Human attention needed</span>
                    </span>
                  )}
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
                  {conversation.needsHumanAttention && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Human attention needed
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat panel */}
      <section
        className={`${
          selectedPhone ? "flex" : "hidden lg:flex"
        } min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950/40`}
      >
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
            <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={backToList}
                  aria-label="Back to conversations"
                  className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 19.5 8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
                  {selectedPhone.slice(-2)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                    +{selectedPhone.replace(/^\+/, "")}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {messages.length} messages
                  </p>
                </div>
              </div>
              {selectedNeedsAttention && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                  <AttentionIcon />
                  Human attention needed
                </span>
              )}
            </header>

            {selectedNeedsAttention && (
              <div
                role="status"
                className="flex items-start gap-3 border-b border-amber-200 bg-amber-50/80 px-6 py-3 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
                  <AttentionIcon />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    AI advisor recommends a human review
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                    {selectedAttentionReason ||
                      "This request may need information, action, or judgment from your team."}
                  </p>
                </div>
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 flex-col">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToOldestMessage}
                  aria-label="Scroll to first message"
                  title="Scroll to first message"
                  className="absolute right-5 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 18.75l7.5-7.5 7.5 7.5M4.5 5.25h15"
                    />
                  </svg>
                </button>
              )}

              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 space-y-2 overflow-y-auto px-6 py-4"
              >
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
                            isUser ? "text-zinc-400" : "text-emerald-100/80"
                          }`}
                        >
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <form
              onSubmit={handleSend}
              className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {sendError && (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400">
                  {sendError}
                </p>
              )}
              <div className="flex items-end gap-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  maxLength={4096}
                  rows={1}
                  disabled={sending}
                  placeholder="Type a WhatsApp reply…"
                  aria-label="WhatsApp reply"
                  className="max-h-36 min-h-11 flex-1 resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                >
                  <span>{sending ? "Sending…" : "Send"}</span>
                  {!sending && (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m6 12-3.269-9.53A59.77 59.77 0 0 1 21.485 12 59.768 59.768 0 0 1 2.731 21.53L6 12Zm0 0h7.5"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-right text-[11px] text-zinc-400">
                Enter to send · Shift+Enter for a new line · {draft.length}/4096
              </p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
