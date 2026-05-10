import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, "..", "hook", "heartbeat.sh");

async function runHook({ env, stdin }) {
  const proc = Bun.spawn([hookPath], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(stdin);
  await proc.stdin.end();
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  const stdout = await new Response(proc.stdout).text();
  return { exitCode, stderr, stdout };
}

// Capturing proxy: a minimal Bun.serve that records the raw JSON body the hook
// POSTs to /events. Lets the tests assert on what the *hook* actually emitted,
// before the real server's `needs` allow-list rewrites/strips it. Mirrors
// test/hook-status-emit.test.js's createCaptureServer.
function createCaptureServer() {
  const captured = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/events") {
        try {
          const body = await req.json();
          captured.push(body);
        } catch {
          captured.push({ __parse_error: true });
        }
        return new Response(null, { status: 202 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return {
    server,
    captured,
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

const NEEDS_ENUM = [
  "approve-tool",
  "answer-question",
  "provide-input",
  "pick-option",
  "confirm-destructive",
  "resolve-conflict",
  "review-diff",
];

describe("CLAUDE_DISPLAY_NEEDS override emits needs verbatim on attention-state events", () => {
  for (const overrideValue of NEEDS_ENUM) {
    it(`emits needs === '${overrideValue}' on the wire when CLAUDE_DISPLAY_NEEDS=${overrideValue} and resolved status is 'approval'`, async () => {
      const cap = createCaptureServer();
      try {
        const env = {
          PATH: process.env.PATH,
          HOSTNAME: "hostA",
          TMUX_PANE: `%${overrideValue.length}`,
          CLAUDE_DISPLAY_URL: cap.baseUrl,
          CLAUDE_DISPLAY_STATUS: "approval",
          CLAUDE_DISPLAY_NEEDS: overrideValue,
        };
        const { exitCode, stderr } = await runHook({
          env,
          // PreToolUse + status override 'approval' → resolved status is
          // 'approval' (an attention-state value), so the needs filter passes.
          stdin: JSON.stringify({ cwd: `/needs/${overrideValue}`, hook_event_name: "PreToolUse" }),
        });
        expect(exitCode, `stderr: ${stderr}`).toBe(0);
        expect(cap.captured).toHaveLength(1);
        expect(cap.captured[0].needs).toBe(overrideValue);
      } finally {
        cap.stop();
      }
    });
  }
});
