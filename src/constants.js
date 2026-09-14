import plugin from "../plugin.json";

export const PLUGIN_ID = plugin.id;

/** Supported connection types. */
export const PROVIDERS = [
  ["openai", "OpenAI Compatible"],
  ["anthropic", "Anthropic Compatible"],
  ["openrouter", "OpenRouter (sign in)"],
];

/** Legacy built-in models kept for OpenRouter compatibility. */
export const MODELS = [
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-haiku-4-5", "Claude Haiku 4.5"],
  ["claude-opus-4-8", "Claude Opus 4.8"],
  ["claude-fable-5", "Claude Fable 5"],
];

export const OPENROUTER_SLUGS = {
  "claude-opus-5": "anthropic/claude-opus-5",
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
  "claude-fable-5": "anthropic/claude-fable-5",
};

export const DEFAULTS = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  openrouterKey: "",
  modelMode: "auto",
  model: "",
  detectedModel: "",
  maxTokens: 8192,
  extendedThinking: false,
  streaming: true,
  systemPrompt: "",
};

export const BASE_SYSTEM_PROMPT = [
  "You are an AI pair-programmer embedded inside the Acode code editor on Android.",
  "Be concise and practical. When you output code, wrap it in fenced Markdown code blocks",
  "and specify the language. Prefer complete, runnable snippets over fragments, and only",
  "explain what is genuinely useful. Assume the user is a developer.",
].join(" ");

export const CODE_ONLY_SYSTEM_PROMPT = [
  "You are a code transformation engine inside the Acode editor.",
  "Return ONLY the transformed source code for the snippet the user provides.",
  "Do not add explanations, comments about your changes, or Markdown fences —",
  "output raw code only, preserving the original indentation style.",
].join(" ");

export const SIDEBAR_ID = "axynity-ai-chat";

export const COMMANDS = {
  OPEN_CHAT: "axynity:open-chat",
  CONNECT: "axynity:connect-openrouter",
  ASK: "axynity:ask",
  EXPLAIN: "axynity:explain-selection",
  REFACTOR: "axynity:refactor-selection",
  FIX: "axynity:fix-selection",
  DOCUMENT: "axynity:document-selection",
};
