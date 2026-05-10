import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, "..", "hook", "heartbeat.sh");

function sha256Prefix(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

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

describe("hook posts subagent-flavored body when stdin has parent_tool_use_id", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("nests the subagent under a pre-registered parent on /api/state", async () => {
    // Identity inputs — these are what the parent shell would also see.
    const HOSTNAME = "hostA";
    const TMUX_PANE = "%5";
    const cwd = "/some/dir";
    const parentIdRaw = `${HOSTNAME}:${TMUX_PANE}:${cwd}`;
    const parentId = sha256Prefix(parentIdRaw);

    const parentToolUseId = "tool-use-abc";
    const subIdRaw = `${parentId}:${parentToolUseId}`;
    const subId = sha256Prefix(subIdRaw);

    // Pre-register the parent via direct POST (the parent's heartbeat would
    // do this in production).
    const parentRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: parentId, id_raw: parentIdRaw, status: "working" }),
    });
    expect([200, 202]).toContain(parentRes.status);

    const env = {
      PATH: process.env.PATH,
      HOSTNAME,
      TMUX_PANE,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd, parent_tool_use_id: parentToolUseId, hook_event_name: "UserPromptSubmit" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parent = records[0];
    expect(parent.id).toBe(parentId);
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.id_raw).toBe(subIdRaw);
    expect(sub.status).toBe("working");
  });

  it("leaves the top-level branch unchanged when stdin parent_tool_use_id is absent", async () => {
    // Sanity check — same shell context, but no subagent marker; behaves like
    // the existing top-level hook (one record, no subagents).
    const HOSTNAME = "hostA";
    const TMUX_PANE = "%5";
    const cwd = "/some/dir";

    const env = {
      PATH: process.env.PATH,
      HOSTNAME,
      TMUX_PANE,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd, hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].subagents).toHaveLength(0);
    expect(records[0].status).toBe("idle");
  });
});
