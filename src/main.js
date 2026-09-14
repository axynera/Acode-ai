import plugin from "../plugin.json";
import { SIDEBAR_ID, MODELS, PROVIDERS, DEFAULTS } from "./constants.js";
import { sidebar } from "./sidebar.js";
import {
  registerCommands,
  unregisterCommands,
  registerSelectionMenu,
} from "./commands.js";
import { injectStyles, removeStyles } from "./styles.js";
import { getSetting, setSetting } from "./utils.js";
import { resetClient, refreshModels } from "./session.js";

class AxynityAIPlugin {
  baseUrl = "";

  async init($page, cacheFile, cacheFileUrl) {
    injectStyles();
    try {
      acode.addIcon("axynity-ai-icon", `${this.baseUrl}icon.png`);
    } catch {
      /* icon is cosmetic */
    }

    const sidebarApps = acode.require("sidebarApps");
    sidebarApps.add("axynity-ai-icon", SIDEBAR_ID, "Axynity AI", (container) => {
      sidebar.mount(container);
    });

    registerCommands();
    registerSelectionMenu();
  }

  async destroy() {
    unregisterCommands();
    try { acode.require("sidebarApps").remove(SIDEBAR_ID); } catch { /* already gone */ }
    removeStyles();
  }

  get settings() {
    const provider = getSetting("provider");
    const custom = provider === "openai" || provider === "anthropic";
    return {
      list: [
        {
          key: "provider",
          text: "AI Provider",
          value: provider,
          select: PROVIDERS,
          info: "Choose OpenAI Compatible, Anthropic Compatible, or OpenRouter.",
        },
        ...(custom ? [{
          key: "baseUrl",
          text: "Base URL",
          value: getSetting("baseUrl"),
          prompt: "https://api.example.com/v1",
          promptType: "text",
          info: "Your API root. /v1 is added automatically when needed.",
        }] : []),
        ...(custom ? [{
          key: "apiKey",
          text: "API Key",
          value: getSetting("apiKey"),
          prompt: "sk-...",
          promptType: "text",
          info: "Stored locally on this device.",
          valueText: (v) => (v ? "•••• set" : "not set"),
        }] : []),
        {
          key: "modelMode",
          text: "Model selection",
          value: getSetting("modelMode"),
          select: [
            ["auto", "Auto detect from /models"],
            ["manual", "Manual model ID"],
          ],
          info: "Auto uses the first available model returned by your server. Manual lets you enter an exact model ID.",
        },
        {
          key: "model",
          text: "Manual model ID",
          value: getSetting("model"),
          prompt: "e.g. gpt-5-mini or claude-sonnet-4-5",
          promptType: "text",
          info: "Used only when Model selection is Manual.",
        },
        ...(custom ? [{
          key: "detectedModel",
          text: "Detected model",
          value: getSetting("detectedModel"),
          info: "Read-only result from the server /models endpoint. Use the Model selection setting to choose auto or manual.",
          valueText: (v) => v || "not detected",
        }] : []),
        ...(provider === "openrouter" ? [{
          key: "openrouterKey",
          text: "OpenRouter key",
          value: getSetting("openrouterKey"),
          prompt: "sk-or-...",
          promptType: "text",
          valueText: (v) => (v ? "•••• connected" : "not connected"),
        }] : []),
        {
          key: "maxTokens",
          text: "Max output tokens",
          value: getSetting("maxTokens"),
          prompt: String(DEFAULTS.maxTokens),
          promptType: "number",
        },
        {
          key: "extendedThinking",
          text: "Extended thinking",
          checkbox: !!getSetting("extendedThinking"),
          info: "Used when supported by the selected provider/model.",
        },
        {
          key: "streaming",
          text: "Stream responses",
          checkbox: !!getSetting("streaming"),
        },
        {
          key: "systemPrompt",
          text: "Custom system prompt",
          value: getSetting("systemPrompt"),
          prompt: "Optional extra instructions",
          promptType: "textarea",
          valueText: (v) => (v ? "custom" : "default"),
        },
      ],
      cb: async (key, value) => {
        if (key === "maxTokens") value = Number(value) || DEFAULTS.maxTokens;
        setSetting(key, value);
        if (["apiKey", "baseUrl", "provider", "modelMode", "model"].includes(key)) resetClient();
        if (key === "provider") {
          if (value === "openai" && !getSetting("baseUrl")) setSetting("baseUrl", "https://api.openai.com/v1");
          if (value === "anthropic" && !getSetting("baseUrl")) setSetting("baseUrl", "https://api.anthropic.com/v1");
          sidebar.renderModelBadge?.();
          sidebar.renderEmpty?.();
        }
        if ((key === "apiKey" || key === "baseUrl" || key === "provider") && getSetting("modelMode") === "auto") {
          try {
            const model = await refreshModels();
            acode.require("toast")(`Axynity AI: detected ${model}`, 2500);
            sidebar.renderModelBadge?.();
          } catch (e) {
            acode.require("toast")(e?.message || "Could not detect models.", 3500);
          }
        }
        if (key === "model" || key === "modelMode") sidebar.renderModelBadge?.();
      },
    };
  }
}

if (window.acode) {
  const axynityPlugin = new AxynityAIPlugin();
  acode.setPluginInit(
    plugin.id,
    async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
      axynityPlugin.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      await axynityPlugin.init($page, cacheFile, cacheFileUrl);
    },
    axynityPlugin.settings,
  );
  acode.setPluginUnmount(plugin.id, () => axynityPlugin.destroy());
}
