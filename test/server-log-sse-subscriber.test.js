import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17883;
const READY_TIMEOUT_MS = 5000;

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return res;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server did not become ready: ${lastErr?.message ?? "timeout"}`);
}

describe("SSE subscriber connect/disconnect emits summary lines", () => {
  it("logs one connect and one disconnect line in both sinks for an open+close cycle", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-sse-"));
    const logPath = join(tmpDir, "claude-display.log");
    const proc = Bun.spawn(["bun", "run", "start"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CLAUDE_DISPLAY_PORT: String(TEST_PORT),
        CLAUDE_DISPLAY_LOG_PATH: logPath,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      await waitForReady(`http://127.0.0.1:${TEST_PORT}/`, READY_TIMEOUT_MS);

      // Open an SSE subscription, read a beat to confirm the channel is live,
      // then abort to trigger the stream's cancel callback server-side.
      const ac = new AbortController();
      const sseRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events/stream`, {
        signal: ac.signal,
      });
      expect(sseRes.status).toBe(200);
      const reader = sseRes.body.getReader();
      // Read the initial colon-comment so the connect callback has definitely fired.
      await reader.read();
      ac.abort();
      try { await reader.cancel(); } catch {}

      // Give the server's cancel callback a moment to fire and the logger to flush.
      await new Promise((r) => setTimeout(r, 200));
      proc.kill("SIGTERM");
      try { await proc.exited; } catch {}

      const stdoutText = await new Response(proc.stdout).text();
      const fileText = readFileSync(logPath, "utf8");

      const connectRe = /sse connect/g;
      const disconnectRe = /sse disconnect/g;

      expect((stdoutText.match(connectRe) || []).length).toBe(1);
      expect((stdoutText.match(disconnectRe) || []).length).toBe(1);
      expect((fileText.match(connectRe) || []).length).toBe(1);
      expect((fileText.match(disconnectRe) || []).length).toBe(1);
    } finally {
      try { proc.kill("SIGTERM"); } catch {}
      try { await proc.exited; } catch {}
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
