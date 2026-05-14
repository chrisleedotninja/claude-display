import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT = 17879;
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

describe("startup line tees to stdout and the log file", () => {
  let proc;
  let tmpDir;
  let logPath;
  let stdoutText = "";

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "cd-log-startup-"));
    logPath = join(tmpDir, "claude-display.log");
    proc = Bun.spawn(["bun", "run", "start"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CLAUDE_DISPLAY_PORT: String(TEST_PORT),
        CLAUDE_DISPLAY_LOG_PATH: logPath,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    await waitForReady(`http://127.0.0.1:${TEST_PORT}/api/state`, READY_TIMEOUT_MS);
    // Give the boot block a moment to flush.
    await new Promise((r) => setTimeout(r, 100));
    // Read whatever has been buffered on stdout so far without blocking forever.
    const reader = proc.stdout.getReader();
    const chunks = [];
    const readDeadline = Date.now() + 500;
    while (Date.now() < readDeadline) {
      const racePromise = Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r({ done: true, value: undefined, _timeout: true }), 100)),
      ]);
      const { done, value, _timeout } = await racePromise;
      if (_timeout) break;
      if (done) break;
      if (value) chunks.push(value);
    }
    reader.releaseLock();
    const decoder = new TextDecoder();
    stdoutText = chunks.map((c) => decoder.decode(c)).join("");
  });

  afterAll(async () => {
    try { proc.kill("SIGTERM"); } catch {}
    try { await proc.exited; } catch {}
    if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes the startup line to stdout", () => {
    expect(stdoutText).toContain("claude-display listening on http://");
  });

  it("writes the startup line to the log file", () => {
    expect(existsSync(logPath)).toBe(true);
    const contents = readFileSync(logPath, "utf8");
    expect(contents).toContain("claude-display listening on http://");
  });
});
