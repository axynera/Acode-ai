import { SIDEBAR_ID } from "./constants.js";
import { renderMarkdown } from "./markdown.js";
import { requireConnection, chatOptions, isConnected, resolveModel } from "./session.js";
import { streamChat, completeChat, describeError } from "./chat.js";
import { connectOpenRouter } from "./oauth.js";
import {
  getSelectedText,
  getActiveFileContent,
  activeFileName,
  activeLanguage,
  replaceSelection,
} from "./utils.js";

class ChatSidebar {
  constructor() {
    this.messages = [];
    this.container = null;
    this.els = {};
    this.busy = false;
    this.stream = null;
    this.context = [];
    this.pending = null;
    this.pendingSubmit = null;
  }

  mount(container) {
    this.container = container;
    container.classList.add("claude-root");
    container.innerHTML = "";

    const topbar = el("div", "claude-topbar");
    const title = el("span", "claude-title", "Axynity AI");
    const model = el("span", "claude-model");
    const spacer = el("div", "claude-spacer");
    const newBtn = iconBtn("＋", "New chat", () => this.newChat());
    const settingsBtn = iconBtn("⚙", "Settings", () => this.openSettings());
    topbar.append(title, model, spacer, newBtn, settingsBtn);

    const messages = el("div", "claude-messages");
    const contextRow = el("div", "claude-context");
    const composer = el("div", "claude-composer");
    const attach = el("div", "claude-attach");
    const attachSel = smallBtn("»", "Attach selection", () => this.attachSelection());
    const attachFile = smallBtn("¶", "Attach current file", () => this.attachFile());
    attach.append(attachSel, attachFile);

    const input = document.createElement("textarea");
    input.className = "claude-input";
    input.placeholder = "Ask Axynity AI…";
    input.rows = 1;
    input.addEventListener("input", () => autoGrow(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.onSend();
      }
    });

    const send = document.createElement("button");
    send.className = "claude-send";
    send.textContent = "➤";
    send.title = "Send";
    send.onclick = () => this.onSend();
    composer.append(attach, input, send);
    container.append(topbar, messages, contextRow, composer);
    this.els = { model, messages, contextRow, input, send };

    this.renderModelBadge();
    this.renderContext();
    this.renderEmpty();

    if (this.pending) {
      const { prompt, autoSend } = this.pending;
      this.pending = null;
      this.applyPrompt(prompt, autoSend);
    }
    if (this.pendingSubmit) {
      const { userText, contextText } = this.pendingSubmit;
      this.pendingSubmit = null;
      this.submit(userText, contextText);
    }
  }

  get mounted() { return !!this.container; }

  renderModelBadge() {
    if (this.els.model) this.els.model.textContent = chatOptions().model || "auto";
  }

  renderEmpty() {
    if (this.messages.length || !this.els.messages) return;
    this.els.messages.innerHTML = "";
    const empty = el("div", "claude-empty");
    if (!isConnected()) {
      const title = el("div");
      title.innerHTML = "<b>Welcome to Axynity AI</b>";
      const hint = el("div");
      hint.style.margin = "8px 0 14px";
      hint.textContent = "Set an OpenAI Compatible or Anthropic Compatible Base URL and API key in settings.";
      const settings = el("button", "claude-linkbtn", "Open Axynity AI settings");
      settings.onclick = () => this.openSettings();
      empty.append(title, hint, settings);
    } else {
      empty.innerHTML = "<b>Axynity AI</b><br>Ask a question, or attach the current file / selection, then send.";
    }
    this.els.messages.append(empty);
  }

  newChat() {
    if (this.busy) this.abort();
    this.messages = [];
    this.context = [];
    if (this.els.messages) this.els.messages.innerHTML = "";
    this.renderContext();
    this.renderEmpty();
  }

  openSettings() {
    try {
      acode.execCommand?.("open-plugin-settings", null, { id: SIDEBAR_ID });
    } catch {
      acode.require("toast")("Open Axynity AI settings from the plugin page.", 3000);
    }
  }

  attachSelection() {
    const text = getSelectedText();
    if (!text.trim()) return acode.require("toast")("Nothing is selected in the editor.", 3000);
    this.context.push({ label: `selection · ${activeFileName()}`, text: fenced(text, activeLanguage()) });
    this.renderContext();
  }

  attachFile() {
    const text = getActiveFileContent();
    if (!text.trim()) return acode.require("toast")("The active file is empty.", 3000);
    this.context.push({ label: `file · ${activeFileName()}`, text: `File: ${activeFileName()}\n${fenced(text, activeLanguage())}` });
    this.renderContext();
  }

  renderContext() {
    const row = this.els.contextRow;
    if (!row) return;
    row.innerHTML = "";
    this.context.forEach((ctx, i) => {
      const chip = el("div", "claude-chip");
      const label = document.createElement("span");
      label.textContent = ctx.label;
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.title = "Remove";
      remove.onclick = () => { this.context.splice(i, 1); this.renderContext(); };
      chip.append(label, remove);
      row.append(chip);
    });
  }

  applyPrompt(prompt, autoSend = false) {
    if (!this.mounted) { this.pending = { prompt, autoSend }; return; }
    if (this.els.input) {
      this.els.input.value = prompt;
      autoGrow(this.els.input);
      this.els.input.focus();
    }
    if (autoSend) this.onSend();
  }

  submit(userText, contextText = "") {
    if (!this.mounted) { this.pendingSubmit = { userText, contextText }; return; }
    if (this.busy) return acode.require("toast")("Axynity AI is still responding — try again in a moment.", 3000);
    const conn = requireConnection();
    if (!conn) return;
    const apiUserContent = contextText ? `${contextText}\n\n${userText}` : userText;
    const display = contextText ? `${userText}\n\n_(with attached context)_` : userText;
    this.runTurn(conn, apiUserContent, display);
  }

  onSend() {
    if (this.busy) return this.abort();
    const input = this.els.input;
    const text = (input.value || "").trim();
    if (!text) return;
    const conn = requireConnection();
    if (!conn) return;
    input.value = "";
    autoGrow(input);
    const contextText = this.context.map((c) => c.text).join("\n\n");
    const displayContent = contextText ? `${text}\n\n_(with attached context)_` : text;
    this.context = [];
    this.renderContext();
    this.runTurn(conn, contextText ? `${contextText}\n\n${text}` : text, displayContent);
  }

  async runTurn(conn, apiUserContent, displayContent) {
    this.clearEmpty();
    this.addMessage("user", displayContent);
    this.messages.push({ role: "user", content: apiUserContent });
    const assistant = this.addMessage("assistant", "");
    const streamEl = el("div", "claude-stream claude-cursor");
    assistant.body.append(streamEl);
    let thinkingEl = null;
    this.scrollToBottom();
    this.setBusy(true);

    try {
      const model = await resolveModel();
      const opts = { ...chatOptions(), model };
      this.renderModelBadge();
      let fullText = "";
      if (opts.streaming) {
        this.stream = streamChat(conn, { ...opts, messages: this.messages }, {
          onText: (delta) => { fullText += delta; streamEl.textContent = fullText; this.scrollToBottom(); },
          onThinking: (delta) => {
            if (!thinkingEl) thinkingEl = this.addThinking(assistant.body, streamEl);
            thinkingEl.textContent += delta;
            this.scrollToBottom();
          },
        });
        const final = await this.stream.done;
        fullText = final.text || fullText;
        this.finishAssistant(assistant, streamEl, fullText, final);
      } else {
        fullText = await completeChat(conn, { ...opts, messages: this.messages });
        this.finishAssistant(assistant, streamEl, fullText, null);
      }
      this.messages.push({ role: "assistant", content: fullText });
    } catch (error) {
      const msg = describeError(error);
      streamEl.remove();
      assistant.body.append(el("div", "claude-error", msg));
      if (this.messages[this.messages.length - 1]?.role === "user") this.messages.pop();
    } finally {
      this.setBusy(false);
      this.stream = null;
      this.scrollToBottom();
    }
  }

  finishAssistant(assistant, streamEl, fullText, final) {
    streamEl.remove();
    assistant.body.append(renderMarkdown(fullText || "_(empty response)_", {
      onInsert: (code) => { replaceSelection(code); acode.require("toast")("Inserted into editor", 2000); },
    }));
    if (final?.outputTokens != null) assistant.body.append(el("div", "claude-meta", `${final.outputTokens} output tokens · ${final.model || ""}`));
  }

  addThinking(bodyEl, beforeEl) {
    const details = document.createElement("details");
    details.className = "claude-thinking";
    const summary = document.createElement("summary");
    summary.textContent = "Thinking…";
    const pre = document.createElement("pre");
    details.append(summary, pre);
    bodyEl.insertBefore(details, beforeEl);
    return pre;
  }

  addMessage(role, content) {
    const wrap = el("div", `claude-msg ${role}`);
    wrap.append(el("div", "claude-role", role === "user" ? "You" : "Axynity AI"));
    const body = el("div", "claude-body");
    if (content) {
      if (role === "user") { const p = document.createElement("div"); p.className = "claude-stream"; p.textContent = content; body.append(p); }
      else body.append(renderMarkdown(content));
    }
    wrap.append(body);
    this.els.messages.append(wrap);
    return { wrap, body };
  }

  clearEmpty() { this.els.messages?.querySelector(".claude-empty")?.remove(); }

  setBusy(busy) {
    this.busy = busy;
    const send = this.els.send;
    if (!send) return;
    send.textContent = busy ? "■" : "➤";
    send.classList.toggle("stop", busy);
    send.title = busy ? "Stop" : "Send";
  }

  abort() { try { this.stream?.abort(); } catch { /* ignore */ } }

  scrollToBottom() {
    const m = this.els.messages;
    if (!m) return;
    const nearBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 120;
    if (nearBottom) m.scrollTop = m.scrollHeight;
  }

  open() {
    try {
      const icon = document.querySelector(`[data-action="sidebar-app"][data-id="${SIDEBAR_ID}"]`);
      icon?.click();
      const bar = document.getElementById("sidebar");
      if (bar && typeof bar.show === "function") bar.show();
    } catch { /* ignore */ }
    setTimeout(() => this.els.input?.focus(), 150);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function fenced(code, lang) { return "```" + (lang || "") + "\n" + code + "\n```"; }
function iconBtn(text, title, onclick) { const b = el("button", "claude-iconbtn", text); b.title = title; b.onclick = onclick; return b; }
function smallBtn(text, title, onclick) { const b = el("button", "claude-smallbtn", text); b.title = title; b.onclick = onclick; return b; }
function autoGrow(input) { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }

export const sidebar = new ChatSidebar();
