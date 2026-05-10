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

describe("hook posts end-flavored body when stdin has hook_event_name=SubagentStop", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("removes the subagent from the parent record when SubagentStop fires", async () => {
    const HOSTNAME = "hostA";
    const TMUX_PANE = "%5";
    const cwd = "/some/dir";
    const parentIdRaw = `${HOSTNAME}:${TMUX_PANE}:${cwd}`;
    const parentId = sha256Prefix(parentIdRaw);

    const parentToolUseId = "tool-use-abc";
    const subIdRaw = `${parentId}:${parentToolUseId}`;
    const subId = sha256Prefix(subIdRaw);

    // Pre-register parent and subagent via direct POST.
    const parentRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: parentId, id_raw: parentIdRaw, status: "working" }),
    });
    expect([200, 202]).toContain(parentRes.status);
    const subRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: subId,
        id_raw: subIdRaw,
        status: "active",
        parent_id: parentId,
      }),
    });
    expect([200, 202]).toContain(subRes.status);

    // Sanity baseline: subagent is recorded.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe(subId);

    // Now run the hook with hook_event_name=SubagentStop.
    const env = {
      PATH: process.env.PATH,
      HOSTNAME,
      TMUX_PANE,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        parent_tool_use_id: parentToolUseId,
        hook_event_name: "SubagentStop",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    // The subagent record is gone; the parent's own record is unchanged.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(parentId);
    expect(records[0].subagents).toHaveLength(0);
  });

  it("does NOT remove the subagent when hook_event_name is absent (preserves activity-event upsert)", async () => {
    const HOSTNAME = "hostB";
    const TMUX_PANE = "%6";
    const cwd = "/other/dir";
    const parentIdRaw = `${HOSTNAME}:${TMUX_PANE}:${cwd}`;
    const parentId = sha256Prefix(parentIdRaw);

    const parentToolUseId = "tool-use-xyz";
    const subIdRaw = `${parentId}:${parentToolUseId}`;
    const subId = sha256Prefix(subIdRaw);

    // Pre-register the parent. The hook itself will register the subagent
    // (via activity-event upsert).
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

    // Run the hook WITHOUT hook_event_name — should post the existing active
    // shape and the subagent should be present (not removed).
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        parent_tool_use_id: parentToolUseId,
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(parentId);
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe(subId);
    expect(records[0].subagents[0].status).toBe("active");
  });

  it("does NOT remove the subagent for a non-Stop hook_event_name (e.g. UserPromptSubmit)", async () => {
    const HOSTNAME = "hostC";
    const TMUX_PANE = "%7";
    const cwd = "/third/dir";
    const parentIdRaw = `${HOSTNAME}:${TMUX_PANE}:${cwd}`;
    const parentId = sha256Prefix(parentIdRaw);

    const parentToolUseId = "tool-use-qrs";
    const subIdRaw = `${parentId}:${parentToolUseId}`;
    const subId = sha256Prefix(subIdRaw);

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
      stdin: JSON.stringify({
        cwd,
        parent_tool_use_id: parentToolUseId,
        hook_event_name: "UserPromptSubmit",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe(subId);
    expect(records[0].subagents[0].status).toBe("active");
  });
});
