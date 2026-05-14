import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17881;
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

describe("CLAUDE_DISPLAY_VERBOSE=1 dumps full request bodies to both sinks", () => {
  it("emits a dump block with method/path/headers/body for a POST, plus the slice-002 summary", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-verbose-env-"));
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

      const bodyJson = JSON.stringify({ id: "verbose1", status: "working" });
      const postRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Test-Marker": "abc" },
        body: bodyJson,
      });
      expect(postRes.status).toBe(202);
      await postRes.text();

      await new Promise((r) => setTimeout(r, 150));
      proc.kill("SIGTERM");
      try { await proc.exited; } catch {}

      const stdoutText = await new Response(proc.stdout).text();
      const fileText = readFileSync(logPath, "utf8");

      for (const sink of [stdoutText, fileText]) {
        expect(sink).toContain("--- request ---");
        expect(sink).toContain("method: POST");
        expect(sink).toContain("path: /events");
        expect(sink).toMatch(/headers:\n(?:\s{2}.+\n)+body:/);
        expect(sink).toContain(bodyJson);
        // slice-002 one-line summary still present
        expect(sink).toMatch(/POST \/events 202/);
      }
    } finally {
      try { proc.kill("SIGTERM"); } catch {}
      try { await proc.exited; } catch {}
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
