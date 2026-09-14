import * as compatible from "./api.js";
import * as openrouter from "./openrouter.js";

export function streamChat(conn, options, callbacks) {
  if (conn.provider === "openrouter") {
    const h = openrouter.streamChat(conn.key, options, callbacks);
    return {
      abort: h.abort,
      done: h.done.then((r) => ({
        text: r.text,
        outputTokens: r.usage?.completion_tokens,
        model: r.model,
      })),
    };
  }
  const h = compatible.streamChat(conn.provider, conn.baseUrl, conn.key, options, callbacks);
  return {
    abort: h.abort,
    done: h.done.then((r) => ({
      text: r.text,
      outputTokens: r.usage?.completion_tokens || r.usage?.output_tokens,
      model: r.model,
    })),
  };
}

export async function completeChat(conn, options) {
  if (conn.provider === "openrouter") {
    const r = await openrouter.completeChat(conn.key, options);
    return r.text;
  }
  const r = await compatible.completeChat(conn.provider, conn.baseUrl, conn.key, options);
  return r.text;
}

export const describeError = compatible.describeError;
