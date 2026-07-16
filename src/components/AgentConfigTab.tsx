"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_BASE_URL,
  apiFetch,
  formatDateTime,
  type AgentConfig,
} from "@/lib/api";

const CUSTOM_MODEL_VALUE = "__custom__";

const SUGGESTED_MODELS = [
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-pro",
  "o3",
  "o3-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o-mini",
];

type ModelListResponse = {
  models: string[];
  source?: "openai" | "default";
};

export default function AgentConfigTab() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [modelListSource, setModelListSource] = useState<
    ModelListResponse["source"] | null
  >(null);
  const [customModelSelected, setCustomModelSelected] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch<AgentConfig>("/agent-config");
      setConfig(data);
      setModel(data.model ?? "");
      setSystemPrompt(data.systemPrompt ?? "");
      setError(null);
    } catch {
      setError(
        `Could not reach the API at ${API_BASE_URL}. Is the server running?`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const data = await apiFetch<ModelListResponse>("/agent-config/models");
      setModels(data.models.length > 0 ? data.models : SUGGESTED_MODELS);
      setModelListSource(data.source ?? "openai");
    } catch {
      setModels(SUGGESTED_MODELS);
      setModelListSource("default");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchConfig(), fetchModels()]);
    };

    void load();
  }, [fetchConfig, fetchModels]);

  const saveConfig = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data = await apiFetch<AgentConfig>("/agent-config", {
        method: "PUT",
        body: JSON.stringify({ model, systemPrompt }),
      });
      setConfig(data);
      setModel(data.model ?? "");
      setCustomModelSelected(false);
      setSystemPrompt(data.systemPrompt ?? "");
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Saving the configuration failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = models?.length ? models : SUGGESTED_MODELS;
  const isCustomModel = model !== "" && !modelOptions.includes(model);
  const selectValue =
    customModelSelected || isCustomModel ? CUSTOM_MODEL_VALUE : model;
  const showCustomModelInput = customModelSelected || isCustomModel;

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Agent configuration
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Control the model and behavior of the WhatsApp assistant. Changes apply
        to the next incoming message.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Loading configuration…
        </p>
      ) : (
        <div className="mt-6 space-y-5 pb-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <label
              htmlFor="agent-model"
              className="block font-medium text-zinc-900 dark:text-zinc-50"
            >
              Model
            </label>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Choose one OpenAI model to generate replies.
            </p>
            <select
              id="agent-model"
              value={selectValue}
              onChange={(event) => {
                const value = event.target.value;

                if (value === CUSTOM_MODEL_VALUE) {
                  setCustomModelSelected(true);
                  setModel(isCustomModel ? model : "");
                  return;
                }

                setCustomModelSelected(false);
                setModel(value);
              }}
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">
                Server default ({config?.effectiveModel ?? "gpt-5.5"})
              </option>
              {modelOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
              <option value={CUSTOM_MODEL_VALUE}>Custom model...</option>
            </select>
            {showCustomModelInput && (
              <input
                aria-label="Custom OpenAI model"
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={config?.effectiveModel ?? "gpt-5.5"}
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            )}
            <p className="mt-2 text-xs text-zinc-400">
              {modelListSource === "openai"
                ? "Models fetched from your OpenAI account."
                : "Showing suggested OpenAI chat models. Choose Custom model to type another model ID."}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <label
              htmlFor="agent-system-prompt"
              className="block font-medium text-zinc-900 dark:text-zinc-50"
            >
              System prompt
            </label>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Instructions that define the assistant&apos;s personality and
              rules.
            </p>
            <textarea
              id="agent-system-prompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder={config?.effectiveSystemPrompt}
              rows={8}
              className="mt-3 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="mt-2 text-xs text-zinc-400">
              Leave empty to use the server default shown as placeholder text.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-xs text-zinc-400">
              {config?.updatedAt
                ? `Last saved ${formatDateTime(config.updatedAt)}`
                : "Not customized yet — server defaults are active."}
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
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
