import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join, basename } from "node:path";
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

async function runGit(cwd, args) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

describe("hook reflects current branch after a branch switch", () => {
  let handle;
  let baseUrl;
  let repoDir;

  beforeEach(async () => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    repoDir = await mkdtemp(join(tmpdir(), "claude-display-branchswitch-"));
    await runGit(repoDir, ["init", "-q", "-b", "main"]);
    await runGit(repoDir, ["commit", "--allow-empty", "-q", "-m", "init"]);
  });

  afterEach(async () => {
    handle.stop();
    if (repoDir) await rm(repoDir, { recursive: true, force: true });
  });

  it("posts the new branch after `git switch -c feature/x`, repo unchanged", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%9",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const stdin = JSON.stringify({ cwd: repoDir, hook_event_name: "SessionStart" });

    const first = await runHook({ env, stdin });
    expect(first.exitCode, `stderr: ${first.stderr}`).toBe(0);

    let stateRes = await fetch(`${baseUrl}/api/state`);
    let records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].branch).toBe("main");
    const repoNameAfterFirst = records[0].repo;
    expect(repoNameAfterFirst).toBe(basename(repoDir));

    await runGit(repoDir, ["switch", "-q", "-c", "feature/x"]);

    const second = await runHook({ env, stdin });
    expect(second.exitCode, `stderr: ${second.stderr}`).toBe(0);

    stateRes = await fetch(`${baseUrl}/api/state`);
    records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].branch).toBe("feature/x");
    expect(records[0].repo).toBe(repoNameAfterFirst);
  });
});
