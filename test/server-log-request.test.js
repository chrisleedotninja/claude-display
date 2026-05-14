import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17880;
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

describe("each HTTP request emits one summary line in both sinks", () => {
  it("logs exactly one summary line per request to both sinks", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-req-"));
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
      // Probe via `/` so the readiness loop doesn't pollute the
      // `GET /api/state` log-line count we assert on below.
      await waitForReady(`http://127.0.0.1:${TEST_PORT}/`, READY_TIMEOUT_MS);

      // GET /api/state
      const getRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/state`);
      expect(getRes.status).toBe(200);
      await getRes.text();

      // POST /events with a valid payload
      const postRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "abc123de", status: "working" }),
      });
      expect(postRes.status).toBe(202);
      await postRes.text();

      // Give the logger a moment to flush, then terminate so stdout reaches EOF.
      await new Promise((r) => setTimeout(r, 150));
      proc.kill("SIGTERM");
      try { await proc.exited; } catch {}

      const stdoutText = await new Response(proc.stdout).text();
      const fileText = readFileSync(logPath, "utf8");

      const getLineRe = /GET \/api\/state 200/g;
      const postLineRe = /POST \/events 202/g;

      const stdoutGet = (stdoutText.match(getLineRe) || []).length;
      const stdoutPost = (stdoutText.match(postLineRe) || []).length;
      const fileGet = (fileText.match(getLineRe) || []).length;
      const filePost = (fileText.match(postLineRe) || []).length;

      // Exactly one of each in each sink — neither dropped nor duplicated.
      expect(stdoutGet).toBe(1);
      expect(stdoutPost).toBe(1);
      expect(fileGet).toBe(1);
      expect(filePost).toBe(1);
    } finally {
      try { proc.kill("SIGTERM"); } catch {}
      try { await proc.exited; } catch {}
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
