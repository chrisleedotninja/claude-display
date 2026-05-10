import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

// Pick a likely-free high port. The `start` script reads CLAUDE_DISPLAY_PORT
// from the environment so tests can avoid colliding with a real server.
const TEST_PORT = 17878;
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

describe("`bun run start` boots a working server", () => {
  let proc;

  beforeAll(() => {
    proc = Bun.spawn(["bun", "run", "start"], {
      cwd: projectRoot,
      env: { ...process.env, CLAUDE_DISPLAY_PORT: String(TEST_PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  afterAll(async () => {
    try {
      proc.kill("SIGTERM");
    } catch {}
    try {
      await proc.exited;
    } catch {}
  });

  it("responds 200 on GET /api/state with a JSON array", async () => {
    const url = `http://127.0.0.1:${TEST_PORT}/api/state`;
    const res = await waitForReady(url, READY_TIMEOUT_MS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
