import { fetchModels } from "./api.js";
import { getSetting, setSetting } from "./utils.js";
import { BASE_SYSTEM_PROMPT } from "./constants.js";

let modelPromise = null;

export function getProvider() {
  const provider = getSetting("provider");
  return ["openai", "anthropic", "openrouter"].includes(provider) ? provider : "openai";
}

export function resetClient() {
  modelPromise = null;
}

export function isConnected() {
  const provider = getProvider();
  if (provider === "openrouter") return !!(getSetting("openrouterKey") || "").trim();
  return !!(getSetting("apiKey") || "").trim() && !!(getSetting("baseUrl") || "").trim();
}

/** Automatically resolve and cache the first model exposed by /models. */
export async function resolveModel() {
  if (getSetting("modelMode") === "manual") {
    const model = (getSetting("model") || "").trim();
    if (!model) throw new Error("Manual model is empty. Enter a model ID in settings.");
    return model;
  }

  const provider = getProvider();
  if (provider === "openrouter") return getSetting("model") || "claude-opus-5";

  const cached = (getSetting("detectedModel") || "").trim();
  if (cached) return cached;
  if (!modelPromise) {
    modelPromise = fetchModels(provider, getSetting("baseUrl"), getSetting("apiKey"))
      .then((models) => {
        const model = models[0];
        setSetting("detectedModel", model);
        return model;
      })
      .finally(() => { modelPromise = null; });
  }
  return modelPromise;
}

/** Refresh the auto-detected model list and select the first model. */
export async function refreshModels() {
  const provider = getProvider();
  if (provider === "openrouter") return getSetting("model") || "claude-opus-5";
  const models = await fetchModels(provider, getSetting("baseUrl"), getSetting("apiKey"));
  const current = (getSetting("detectedModel") || "").trim();
  const selected = current && models.includes(current) ? current : models[0];
  setSetting("detectedModel", selected);
  return selected;
}

export function requireConnection() {
  const provider = getProvider();
  if (provider === "openrouter") {
    const key = (getSetting("openrouterKey") || "").trim();
    if (!key) {
      acode.require("toast")("Sign in with OpenRouter first.", 4000);
      return null;
    }
    return { provider, key, baseUrl: "https://openrouter.ai/api/v1" };
  }

  const key = (getSetting("apiKey") || "").trim();
  const baseUrl = (getSetting("baseUrl") || "").trim();
  if (!key || !baseUrl) {
    acode.require("toast")("Set Base URL and API key in Axynity AI settings.", 5000);
    return null;
  }
  return { provider, key, baseUrl };
}

export function chatOptions(overrides = {}) {
  const custom = (getSetting("systemPrompt") || "").trim();
  const system = custom ? `${BASE_SYSTEM_PROMPT}\n\n${custom}` : BASE_SYSTEM_PROMPT;
  return {
    model: getSetting("modelMode") === "manual" ? getSetting("model") : getSetting("detectedModel"),
    maxTokens: getSetting("maxTokens"),
    thinking: !!getSetting("extendedThinking"),
    streaming: !!getSetting("streaming"),
    system,
    ...overrides,
  };
}
