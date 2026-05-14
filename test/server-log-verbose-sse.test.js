import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17885;
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

describe("verbose mode dumps SSE stream connect requests", () => {
  it("dumps GET /events/stream method/path/headers (empty body) in both sinks", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-verbose-sse-"));
    const logPath = join(tmpDir, "claude-display.log");
    const proc = Bun.spawn(["bun", "run", "start"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CLAUDE_DISPLAY_PORT: String(TEST_PORT),
        CLAUDE_DISPLAY_LOG_PATH: logPath,
        CLAUDE_DISPLAY_VERBOSE: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      await waitForReady(`http://127.0.0.1:${TEST_PORT}/`, READY_TIMEOUT_MS);

      const ac = new AbortController();
      const sseRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events/stream`, {
        signal: ac.signal,
      });
      expect(sseRes.status).toBe(200);
      const reader = sseRes.body.getReader();
      await reader.read();
      ac.abort();
      try { await reader.cancel(); } catch {}

      await new Promise((r) => setTimeout(r, 200));
      proc.kill("SIGTERM");
      try { await proc.exited; } catch {}

      const stdoutText = await new Response(proc.stdout).text();
      const fileText = readFileSync(logPath, "utf8");

      for (const sink of [stdoutText, fileText]) {
        // Locate the dump block for the SSE GET specifically.
        const sseBlockRe =
          /--- request ---\nmethod: GET\npath: \/events\/stream\nheaders:\n(?:\s{2}.+\n)+body: <empty>\n---/;
        expect(sink).toMatch(sseBlockRe);
        // Existing sse connect summary line still appears.
        expect(sink).toMatch(/sse connect/);
      }
    } finally {
      try { proc.kill("SIGTERM"); } catch {}
      try { await proc.exited; } catch {}
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
