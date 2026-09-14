import { COMMANDS, CODE_ONLY_SYSTEM_PROMPT } from "./constants.js";
import { sidebar } from "./sidebar.js";
import { requireConnection, chatOptions, resolveModel } from "./session.js";
import { completeChat, describeError } from "./chat.js";
import { connectOpenRouter } from "./oauth.js";
import {
  getSelectedText,
  getActiveFileContent,
  activeLanguage,
  activeFileName,
  replaceSelection,
  stripCodeFences,
} from "./utils.js";

function toast(msg, dur = 3000) { acode.require("toast")(msg, dur); }
function fenced(code, lang) { return "```" + (lang || "") + "\n" + code + "\n```"; }
function selectionOrFile() {
  const selection = getSelectedText();
  if (selection.trim()) return { code: selection, scope: "selection", whole: false };
  const file = getActiveFileContent();
  if (file.trim()) return { code: file, scope: "file", whole: true };
  return null;
}
function askInChat(question, { includeCode = true } = {}) {
  let contextText = "";
  if (includeCode) {
    const src = selectionOrFile();
    if (src) contextText = `${src.whole ? `File: ${activeFileName()}` : "Selected code:"}\n${fenced(src.code, activeLanguage())}`;
  }
  sidebar.open();
  sidebar.submit(question, contextText);
}

async function transform(instruction) {
  const conn = requireConnection();
  if (!conn) return;
  const src = selectionOrFile();
  if (!src) return toast("Select some code (or open a non-empty file) first.");
  const lang = activeLanguage();
  const loader = acode.require("loader");
  loader.create("Axynity AI", "Thinking…");
  try {
    const model = await resolveModel();
    const opts = chatOptions({ system: CODE_ONLY_SYSTEM_PROMPT, thinking: false, model });
    const userContent = `${instruction}\n\nLanguage: ${lang || "unknown"}\n\n${fenced(src.code, lang)}`;
    const result = await completeChat(conn, { ...opts, messages: [{ role: "user", content: userContent }] });
    loader.destroy();
    const cleaned = stripCodeFences(result);
    if (!cleaned.trim()) return toast("Axynity AI returned an empty result.");
    const scopeLabel = src.whole ? "the whole file" : "the selection";
    const ok = await acode.confirm("Axynity AI", `Replace ${scopeLabel} with Axynity AI's result?`);
    if (ok) {
      if (src.whole) editorManager.editor.session.setValue(cleaned);
      else replaceSelection(cleaned);
      editorManager.editor.focus();
      toast("Applied Axynity AI changes.", 2000);
    }
  } catch (error) {
    loader.destroy();
    toast(describeError(error), 4000);
  }
}

export const commandList = [
  { name: COMMANDS.OPEN_CHAT, description: "Axynity AI: Open chat", bindKey: { win: "Ctrl-Shift-L", mac: "Cmd-Shift-L" }, exec: () => { sidebar.open(); return true; } },
  { name: COMMANDS.CONNECT, description: "Axynity AI: Connect (OpenRouter)", exec: async () => { await connectOpenRouter(); return true; } },
  { name: COMMANDS.ASK, description: "Axynity AI: Ask about code", exec: async () => {
    const question = await acode.prompt("Ask Axynity AI about this code", "", "textarea", { placeholder: "e.g. What does this function do?" });
    if (question?.trim()) askInChat(question.trim(), { includeCode: true });
    return true;
  } },
  { name: COMMANDS.EXPLAIN, description: "Axynity AI: Explain selection", exec: () => { askInChat("Explain what this code does, step by step, and point out anything noteworthy.", { includeCode: true }); return true; } },
  { name: COMMANDS.REFACTOR, description: "Axynity AI: Refactor / improve selection", exec: () => { transform("Refactor and improve this code for readability and correctness while preserving its behavior. Keep the same language."); return true; } },
  { name: COMMANDS.FIX, description: "Axynity AI: Find & fix bugs in selection", exec: () => { transform("Fix any bugs or errors in this code. Return the corrected code with the same public behavior and language."); return true; } },
  { name: COMMANDS.DOCUMENT, description: "Axynity AI: Add doc comments to selection", exec: () => { transform("Add clear documentation comments (docstrings / JSDoc as appropriate for the language) to this code. Do not change the logic."); return true; } },
];

export function registerCommands() {
  for (const cmd of commandList) acode.addCommand(cmd);
}
export function unregisterCommands() {
  for (const cmd of commandList) {
    try { acode.removeCommand(cmd.name); } catch { /* ignore */ }
  }
}
export function registerSelectionMenu() {
  try {
    const selectionMenu = acode.require("selectionMenu");
    selectionMenu.add("Axynity AI", () => sidebar.open());
  } catch { /* optional Acode API */ }
}
