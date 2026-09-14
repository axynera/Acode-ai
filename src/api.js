import { getSetting, setSetting } from "./utils.js";

function cleanBaseUrl(value) {
  let url = String(value || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  return url;
}

function modelsUrl(baseUrl) {
  const base = cleanBaseUrl(baseUrl);
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
}

function endpoint(baseUrl, path) {
  const base = cleanBaseUrl(baseUrl);
  if (base.endsWith("/v1")) return `${base}/${path.replace(/^\//, "")}`;
  return `${base}/v1/${path.replace(/^\//, "")}`;
}

function authHeaders(provider, key) {
  const headers = { "Content-Type": "application/json" };
  if (provider === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function errorFromResponse(res, provider) {
  let detail = "";
  try {
    const json = await res.json();
    detail = json?.error?.message || json?.message || json?.error || "";
  } catch {
    try { detail = await res.text(); } catch { /* ignore */ }
  }
  const name = provider === "anthropic" ? "Anthropic Compatible" : "OpenAI Compatible";
  if (res.status === 401) return new Error(`${name}: invalid API key.`);
  if (res.status === 403) return new Error(`${name}: permission denied.`);
  if (res.status === 429) return new Error(`${name}: rate limit reached.`);
  return new Error(`${name} error ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
}

/** Get models from an OpenAI/Anthropic-compatible /models endpoint. */
export async function fetchModels(provider, baseUrl, apiKey) {
  if (!baseUrl) throw new Error("Base URL is required.");
  if (!apiKey) throw new Error("API key is required.");
  const res = await fetch(modelsUrl(baseUrl), {
    headers: authHeaders(provider, apiKey),
  });
  if (!res.ok) throw await errorFromResponse(res, provider);
  const json = await res.json();
  const raw = Array.isArray(json) ? json : (json?.data || json?.models || []);
  const models = raw
    .map((m) => typeof m === "string" ? m : m?.id || m?.name)
    .filter(Boolean)
    .map(String);
  if (!models.length) throw new Error("The server returned no models from /models.");
  return [...new Set(models)];
}

function openAiBody({ model, maxTokens, system, messages, stream }) {
  const msgs = [];
  if (system) msgs.push({ role: "system", content: system });
  for (const m of messages || []) msgs.push({ role: m.role, content: m.content });
  return {
    model,
    messages: msgs,
    max_tokens: Number(maxTokens) || 8192,
    stream: !!stream,
  };
}

function anthropicBody({ model, maxTokens, system, messages, thinking, stream }) {
  const body = {
    model,
    max_tokens: Number(maxTokens) || 8192,
    messages: messages || [],
    stream: !!stream,
  };
  if (system) body.system = system;
  if (thinking) {
    const max = Number(maxTokens) || 8192;
    body.thinking = { type: "enabled", budget_tokens: Math.min(2048, Math.max(1024, max - 1)) };
  }
  return body;
}

function parseSseLine(line, provider, callbacks, state) {
  const raw = line.trim();
  if (!raw || raw.startsWith(":")) return;
  if (!raw.startsWith("data:")) return;
  const data = raw.slice(5).trim();
  if (data === "[DONE]") return;
  let json;
  try { json = JSON.parse(data); } catch { return; }

  if (json.model) state.model = json.model;
  if (json.usage) state.usage = json.usage;

  if (provider === "anthropic") {
    if (json.type === "content_block_delta") {
      const delta = json.delta;
      if (delta?.type === "thinking_delta") callbacks.onThinking?.(delta.thinking || "");
      if (delta?.type === "text_delta" && delta.text) {
        state.full += delta.text;
        callbacks.onText?.(delta.text);
      }
    }
    return;
  }

  const delta = json.choices?.[0]?.delta;
  if (delta?.reasoning && callbacks.onThinking) callbacks.onThinking(delta.reasoning);
  if (delta?.content) {
    state.full += delta.content;
    callbacks.onText?.(delta.content);
  }
}

async function streamRequest(provider, baseUrl, apiKey, options, callbacks = {}) {
  const controller = new AbortController();
  const body = provider === "anthropic"
    ? anthropicBody({ ...options, stream: true })
    : openAiBody({ ...options, stream: true });
  const res = await fetch(endpoint(baseUrl, provider === "anthropic" ? "messages" : "chat/completions"), {
    method: "POST",
    headers: authHeaders(provider, apiKey),
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  if (!res.ok || !res.body) throw await errorFromResponse(res, provider);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { full: "", usage: null, model: options.model };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) parseSseLine(line, provider, callbacks, state);
    }
    if (buffer) parseSseLine(buffer, provider, callbacks, state);
  } finally {
    reader.releaseLock?.();
  }
  return state;
}

export function streamChat(provider, baseUrl, apiKey, options, callbacks = {}) {
  const controller = new AbortController();
  const done = (async () => {
    const body = provider === "anthropic"
      ? anthropicBody({ ...options, stream: true })
      : openAiBody({ ...options, stream: true });
    const res = await fetch(endpoint(baseUrl, provider === "anthropic" ? "messages" : "chat/completions"), {
      method: "POST",
      headers: authHeaders(provider, apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw await errorFromResponse(res, provider);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state = { full: "", usage: null, model: options.model };
    for (;;) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) parseSseLine(line, provider, callbacks, state);
    }
    if (buffer) parseSseLine(buffer, provider, callbacks, state);
    return { text: state.full, usage: state.usage, model: state.model };
  })();
  return { abort: () => controller.abort(), done };
}

export async function completeChat(provider, baseUrl, apiKey, options) {
  const body = provider === "anthropic"
    ? anthropicBody({ ...options, stream: false })
    : openAiBody({ ...options, stream: false });
  const res = await fetch(endpoint(baseUrl, provider === "anthropic" ? "messages" : "chat/completions"), {
    method: "POST",
    headers: authHeaders(provider, apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFromResponse(res, provider);
  const json = await res.json();
  if (provider === "anthropic") {
    return {
      text: (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
      usage: json.usage || null,
      model: json.model || options.model,
    };
  }
  return {
    text: json.choices?.[0]?.message?.content || "",
    usage: json.usage || null,
    model: json.model || options.model,
  };
}

export function describeError(error) {
  if (error?.name === "AbortError") return "Stopped.";
  return error?.message || "Unknown error.";
}
