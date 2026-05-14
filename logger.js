// Tee logger: writes each line to stdout AND appends to a file at `path`.
//
// Singleton-per-process is expected — `server.js` constructs one at boot and
// shares it across the request handler and SSE callbacks. The file is opened
// in append mode (never truncated) so re-running the server preserves history.
//
// The default `path` is `/tmp/claude-display.log`. Tests override it via
// `CLAUDE_DISPLAY_LOG_PATH` to avoid trampling the real file; the env-var
// override is a test-only seam (see chore 002 spec).

import { appendFileSync } from "node:fs";

export function createLogger({ path = "/tmp/claude-display.log" } = {}) {
  return {
    log(line) {
      const out = `${line}\n`;
      // stdout first so a file-system error doesn't suppress the console copy.
      process.stdout.write(out);
      appendFileSync(path, out);
    },
    close() {
      // No persistent handle held — appendFileSync opens/closes per call.
      // Retained for API symmetry with future buffered implementations.
    },
  };
}
