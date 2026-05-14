import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

const TEST_PORT_A = 17881;
const TEST_PORT_B = 17882;
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

async function spawnAndShutdown(logPath, port) {
  const proc = Bun.spawn(["bun", "run", "start"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CLAUDE_DISPLAY_PORT: String(port),
      CLAUDE_DISPLAY_LOG_PATH: logPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  await waitForReady(`http://127.0.0.1:${port}/`, READY_TIMEOUT_MS);
  // Allow the startup log write to flush before shutdown.
  await new Promise((r) => setTimeout(r, 100));
  try { proc.kill("SIGTERM"); } catch {}
  try { await proc.exited; } catch {}
}

describe("re-running the server appends rather than truncates", () => {
  it("preserves a pre-seeded sentinel across two server runs", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-append-"));
    const logPath = join(tmpDir, "claude-display.log");
    const sentinel = "PRE_SEED_SENTINEL_LINE_xyzzy\n";
    writeFileSync(logPath, sentinel, "utf8");

    try {
      await spawnAndShutdown(logPath, TEST_PORT_A);
      await spawnAndShutdown(logPath, TEST_PORT_B);

      const contents = readFileSync(logPath, "utf8");
      // Sentinel survives both runs (file opened in append mode each time).
      expect(contents.startsWith(sentinel)).toBe(true);
      // Both runs' startup lines made it in.
      const startupRe = /claude-display listening on http:\/\//g;
      expect((contents.match(startupRe) || []).length).toBe(2);
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
