import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

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

describe("hook with cwd outside any git repo", () => {
  let handle;
  let baseUrl;
  let nonRepoDir;

  beforeEach(async () => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    nonRepoDir = await mkdtemp(join(tmpdir(), "claude-display-nonrepo-"));
  });

  afterEach(async () => {
    handle.stop();
    if (nonRepoDir) await rm(nonRepoDir, { recursive: true, force: true });
  });

  it("emits empty repo and branch — never 'unknown', '-', 'n/a', or 'none'", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%9",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: nonRepoDir }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);

    const r = records[0];
    expect(r.repo === undefined || r.repo === "").toBe(true);
    expect(r.branch === undefined || r.branch === "").toBe(true);

    const forbidden = ["unknown", "-", "n/a", "none", "HEAD"];
    for (const f of forbidden) {
      expect(r.repo).not.toBe(f);
      expect(r.branch).not.toBe(f);
    }
  });
});
