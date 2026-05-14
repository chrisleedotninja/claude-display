import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = `${here}/..`;

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

async function runOnce({ port, args, env, postBody }) {
  const tmpDir = mkdtempSync(join(tmpdir(), "cd-log-verbose-cli-"));
  const logPath = join(tmpDir, "claude-display.log");
  const baseEnv = { ...process.env };
  // Strip the verbose env var so the spawn only sees what the test wants.
  delete baseEnv.CLAUDE_DISPLAY_VERBOSE;
  const proc = Bun.spawn(["bun", "run", "server.js", ...args], {
    cwd: projectRoot,
    env: {
      ...baseEnv,
      ...env,
      CLAUDE_DISPLAY_PORT: String(port),
      CLAUDE_DISPLAY_LOG_PATH: logPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    await waitForReady(`http://127.0.0.1:${port}/`, READY_TIMEOUT_MS);
    const postRes = await fetch(`http://127.0.0.1:${port}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: postBody,
    });
    expect(postRes.status).toBe(202);
    await postRes.text();
    await new Promise((r) => setTimeout(r, 150));
    proc.kill("SIGTERM");
    try { await proc.exited; } catch {}
    const stdoutText = await new Response(proc.stdout).text();
    const fileText = readFileSync(logPath, "utf8");
    return { stdoutText, fileText };
  } finally {
    try { proc.kill("SIGTERM"); } catch {}
    try { await proc.exited; } catch {}
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("CLI verbose flags --verbose and -v dump full request payloads", () => {
  it("dumps under --verbose", async () => {
    const body = JSON.stringify({ id: "vlong00x", status: "working" });
    const { stdoutText, fileText } = await runOnce({
      port: 17882,
      args: ["--verbose"],
      env: {},
      postBody: body,
    });
    for (const sink of [stdoutText, fileText]) {
      expect(sink).toContain("--- request ---");
      expect(sink).toContain("method: POST");
      expect(sink).toContain("path: /events");
      expect(sink).toContain(body);
    }
  });

  it("dumps under -v", async () => {
    const body = JSON.stringify({ id: "vshort0x", status: "working" });
    const { stdoutText, fileText } = await runOnce({
      port: 17893,
      args: ["-v"],
      env: {},
      postBody: body,
    });
    for (const sink of [stdoutText, fileText]) {
      expect(sink).toContain("--- request ---");
      expect(sink).toContain("method: POST");
      expect(sink).toContain("path: /events");
      expect(sink).toContain(body);
    }
  });

  it("emits no dump block with neither env var nor flag (default off)", async () => {
    const body = JSON.stringify({ id: "vdefault", status: "working" });
    const { stdoutText, fileText } = await runOnce({
      port: 17884,
      args: [],
      env: {},
      postBody: body,
    });
    for (const sink of [stdoutText, fileText]) {
      expect(sink).not.toContain("--- request ---");
      // slice-002 one-line summary still appears
      expect(sink).toMatch(/POST \/events 202/);
    }
  });
});
