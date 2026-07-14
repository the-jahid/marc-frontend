"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  apiFetch,
  formatDateTime,
  type AbandonedCheckoutConfig,
  type AbandonedCheckoutRunResult,
} from "@/lib/api";

const SAMPLE_NAME = "María";
const SAMPLE_LINK = "https://tienda.example/checkout/recover/AbC123";

function renderPreview(template: string): string {
  const hasLink = /\{\{\s*link\s*\}\}/i.test(template);
  let message = template
    .replace(/\{\{\s*name\s*\}\}/gi, SAMPLE_NAME)
    .replace(/\{\{\s*link\s*\}\}/gi, SAMPLE_LINK)
    .trim();

  if (!hasLink) {
    message = message ? `${message}\n${SAMPLE_LINK}` : SAMPLE_LINK;
  }

  return message;
}

export default function AbandonedCheckoutTab() {
  const [config, setConfig] = useState<AbandonedCheckoutConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("60");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AbandonedCheckoutRunResult | null>(
    null,
  );

  const applyConfig = useCallback((data: AbandonedCheckoutConfig) => {
    setConfig(data);
    setEnabled(data.enabled);
    setMessage(data.messageTemplate);
    setDelayMinutes(String(data.delayMinutes));
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch<AbandonedCheckoutConfig>(
        "/abandoned-checkouts/config",
      );
      applyConfig(data);
      setError(null);
    } catch {
      setError(
        `Could not reach the API at ${API_BASE_URL}. Is the server running?`,
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    const load = async () => {
      await fetchConfig();
    };

    void load();
  }, [fetchConfig]);

  const delayNumber = Number(delayMinutes);
  const delayValid =
    Number.isInteger(delayNumber) && delayNumber >= 1 && delayNumber <= 10080;
  const messageMissing = enabled && message.trim().length === 0;
  const canSave = delayValid && !messageMissing;

  const saveConfig = async () => {
    if (!canSave) {
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      const data = await apiFetch<AbandonedCheckoutConfig>(
        "/abandoned-checkouts/config",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled,
            messageTemplate: message,
            delayMinutes: delayNumber,
          }),
        },
      );
      applyConfig(data);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Saving the settings failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    const confirmed = window.confirm(
      "Run a recovery pass now? This may send WhatsApp messages to customers with abandoned carts.",
    );

    if (!confirmed) {
      return;
    }

    setRunning(true);
    setRunResult(null);
    try {
      const result = await apiFetch<AbandonedCheckoutRunResult>(
        "/abandoned-checkouts/run",
        { method: "POST" },
      );
      setRunResult(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Running the recovery pass failed.",
      );
    } finally {
      setRunning(false);
    }
  };

  const preview = useMemo(() => renderPreview(message), [message]);

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Cart recovery
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Automatically message customers who left items in their cart. Write the
        message here — no official WhatsApp template needed.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Loading settings…
        </p>
      ) : (
        <div className="mt-6 space-y-5 pb-8">
          {config && !config.infrastructureReady && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Shopify or WhatsApp sending is not configured yet, so reminders
              will not be sent until the server has those credentials. You can
              still write and save the message below.
            </p>
          )}

          <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
            <strong>Heads up:</strong> WhatsApp only delivers a free-text message
            to a customer who has written to your number in the last 24 hours.
            Shoppers who abandon a cart usually have not, so some reminders may be
            rejected by WhatsApp unless there is an open conversation. Reaching
            cold contacts reliably requires an approved WhatsApp template.
          </p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                Send cart reminders
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                When on, the server checks Shopify every {config?.pollMinutes ?? 5}{" "}
                minutes and messages eligible customers.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((value) => !value)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                enabled ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Message */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <label
              htmlFor="reminder-message"
              className="block font-medium text-zinc-900 dark:text-zinc-50"
            >
              Reminder message
            </label>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Use{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {"{{name}}"}
              </code>{" "}
              for the customer&apos;s first name and{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {"{{link}}"}
              </code>{" "}
              for their cart link. The link is added automatically if you leave it
              out.
            </p>
            <textarea
              id="reminder-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={config?.defaultMessageTemplate}
              rows={5}
              maxLength={1024}
              className="mt-3 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {messageMissing && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Write a message before turning reminders on.
              </p>
            )}

            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Preview
              </p>
              <div className="mt-2 max-w-sm whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white shadow-sm">
                {preview || "Your message preview will appear here."}
              </div>
            </div>
          </div>

          {/* Delay */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <label
              htmlFor="reminder-delay"
              className="block font-medium text-zinc-900 dark:text-zinc-50"
            >
              Wait before sending
            </label>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              How long after a cart is abandoned to send the reminder.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                id="reminder-delay"
                type="number"
                min={1}
                max={10080}
                value={delayMinutes}
                onChange={(event) => setDelayMinutes(event.target.value)}
                className="w-28 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                minutes
              </span>
            </div>
            {!delayValid && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Enter a whole number of minutes between 1 and 10080 (7 days).
              </p>
            )}
          </div>

          {/* Save row */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-400">
              {config?.updatedAt
                ? `Last saved ${formatDateTime(config.updatedAt)}`
                : "Not customized yet — defaults are active."}
            </p>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                  Saved
                </span>
              )}
              <button
                onClick={saveConfig}
                disabled={saving || !canSave}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {/* Run now */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  Run a pass now
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Check Shopify immediately instead of waiting for the next cycle.
                </p>
              </div>
              <button
                onClick={runNow}
                disabled={running}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {running ? "Running…" : "Run now"}
              </button>
            </div>
            {runResult && (
              <p className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {runResult.skipped
                  ? `Nothing ran — ${
                      runResult.reason === "disabled"
                        ? "reminders are switched off."
                        : runResult.reason === "not-configured"
                          ? "Shopify or WhatsApp is not configured."
                          : runResult.reason === "already-running"
                            ? "a pass is already running."
                            : "skipped."
                    }`
                  : `Scanned ${runResult.scanned} · sent ${runResult.sent} · already completed ${runResult.skippedCompleted} · no phone ${runResult.skippedNoPhone} · already sent ${runResult.skippedAlreadySent} · failed ${runResult.failed}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
