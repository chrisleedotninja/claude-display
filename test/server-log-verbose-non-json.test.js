import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17886;
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

describe("verbose mode safely logs non-JSON and empty request bodies", () => {
  it("dumps text/plain and empty bodies without crashing the server", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-verbose-nonjson-"));
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

      const textBody = "hello-not-json";
      const textRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: textBody,
      });
      // The server's existing JSON-parse path will 400 on text/plain; the
      // point of this test is the server doesn't crash and dumps the body.
      expect([400, 202]).toContain(textRes.status);
      await textRes.text();

      const emptyRes = await fetch(`http://127.0.0.1:${TEST_PORT}/events`, {
        method: "POST",
      });
      expect([400, 202]).toContain(emptyRes.status);
      await emptyRes.text();

      // Subsequent state read must still succeed — server is healthy.
      const stateRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/state`);
      expect(stateRes.status).toBe(200);
      await stateRes.text();

      await new Promise((r) => setTimeout(r, 150));
      proc.kill("SIGTERM");
      try { await proc.exited; } catch {}

      const stdoutText = await new Response(proc.stdout).text();
      const fileText = readFileSync(logPath, "utf8");

      for (const sink of [stdoutText, fileText]) {
        // Each POST /events should produce a dump block. Counting blocks via
        // a path: /events match keyed under a request frame is sufficient.
        const postDumpBlocks = sink.match(
          /--- request ---\nmethod: POST\npath: \/events\nheaders:\n(?:\s{2}.+\n)+body: .+\n---/g,
        ) || [];
        expect(postDumpBlocks.length).toBeGreaterThanOrEqual(2);
        // The text/plain body renders as-is.
        expect(sink).toContain(`body: ${textBody}`);
        // The empty body renders as the explicit sentinel.
        expect(sink).toContain("body: <empty>");
      }
    } finally {
      try { proc.kill("SIGTERM"); } catch {}
      try { await proc.exited; } catch {}
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
