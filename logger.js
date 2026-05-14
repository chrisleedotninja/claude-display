// Tee logger: writes each line to stdout AND appends to a file at `path`.
//
// Singleton-per-process is expected — `server.js` constructs one at boot and
// shares it across the request handler and SSE callbacks. The file is opened
// in append mode (never truncated) so re-running the server preserves history.
//
// The default `path` is `/tmp/claude-display.log`. Tests override it via
// `CLAUDE_DISPLAY_LOG_PATH` to avoid trampling the real file; the env-var
// override is a test-only seam (see chore 002 spec).
//
// When `verbose` is enabled, `dump(label, fields)` emits a multi-line block to
// both sinks, framed by `--- <label> ---` / `---` lines and followed by a
// trailing blank line. `log` is unchanged; `dump` is a no-op when verbose is
// off. The full block format is documented in chore 003 step 0.

import { appendFileSync } from "node:fs";

const EMPTY_BODY_SENTINEL = "<empty>";

function safeBodyText(body) {
  if (body === undefined || body === null) return EMPTY_BODY_SENTINEL;
  if (typeof body !== "string") {
    try {
      return String(body);
    } catch {
      return "<unrenderable body>";
    }
  }
  if (body.length === 0) return EMPTY_BODY_SENTINEL;
  return body;
}

function formatHeaders(headers) {
  if (!headers) return "";
  // Accept either a Headers instance or a plain object/array of pairs.
  let entries;
  if (typeof headers.entries === "function") {
    entries = Array.from(headers.entries());
  } else if (Array.isArray(headers)) {
    entries = headers;
  } else {
    entries = Object.entries(headers);
  }
  return entries.map(([name, value]) => `  ${name}: ${value}`).join("\n");
}

export function createLogger({ path = "/tmp/claude-display.log", verbose = false } = {}) {
  function writeBoth(text) {
    // stdout first so a file-system error doesn't suppress the console copy.
    process.stdout.write(text);
    appendFileSync(path, text);
  }

  return {
    log(line) {
      writeBoth(`${line}\n`);
    },
    dump(label, fields = {}) {
      if (!verbose) return;
      const { method = "", path: reqPath = "", headers, body } = fields;
      const headerLines = formatHeaders(headers);
      const block =
        `--- ${label} ---\n` +
        `method: ${method}\n` +
        `path: ${reqPath}\n` +
        `headers:\n` +
        (headerLines ? `${headerLines}\n` : "") +
        `body: ${safeBodyText(body)}\n` +
        `---\n` +
        `\n`;
      writeBoth(block);
    },
    close() {
      // No persistent handle held — appendFileSync opens/closes per call.
      // Retained for API symmetry with future buffered implementations.
    },
  };
}
