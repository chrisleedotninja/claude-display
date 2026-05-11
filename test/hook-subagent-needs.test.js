import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Capturing proxy: minimal Bun.serve that records what the hook actually
// POSTed. Mirrors test/hook-needs-emit.test.js's createCaptureServer plus
// the parent_tool_use_id stdin pattern from test/hook-subagent-payload.test.js.
function createCaptureServer() {
  const captured = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/events") {
        try {
          const body = await req.json();
          captured.push(body);
        } catch {
          captured.push({ __parse_error: true });
        }
        return new Response(null, { status: 202 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return {
    server,
    captured,
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

describe("hook subagent branch emits needs on attention-state events and drops it otherwise", () => {
  it("subagent branch emits needs='approve-tool' when CLAUDE_DISPLAY_NEEDS=approve-tool and resolved status is 'approval'", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%sub-needs-1",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_STATUS: "approval",
        CLAUDE_DISPLAY_NEEDS: "approve-tool",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/sub-needs/approval",
          parent_tool_use_id: "tool-use-sub-1",
          hook_event_name: "PreToolUse",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].parent_id).toBeDefined();
      expect(cap.captured[0].status).toBe("approval");
      expect(cap.captured[0].needs).toBe("approve-tool");
    } finally {
      cap.stop();
    }
  });

  it("subagent branch emits no needs key when resolved status is 'working' (override valid but filter blocks)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%sub-needs-2",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_STATUS: "working",
        CLAUDE_DISPLAY_NEEDS: "approve-tool",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/sub-needs/working",
          parent_tool_use_id: "tool-use-sub-2",
          hook_event_name: "PreToolUse",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].parent_id).toBeDefined();
      expect(cap.captured[0].status).toBe("working");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });

  it("subagent branch emits no needs key when CLAUDE_DISPLAY_NEEDS is 'bogus' even on attention-state status", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%sub-needs-3",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_STATUS: "approval",
        CLAUDE_DISPLAY_NEEDS: "bogus",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/sub-needs/bogus",
          parent_tool_use_id: "tool-use-sub-3",
          hook_event_name: "PreToolUse",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].parent_id).toBeDefined();
      expect(cap.captured[0].status).toBe("approval");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });

  it("subagent branch emits no needs key on SubagentStop regardless of CLAUDE_DISPLAY_NEEDS (sub_status forced to idle)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%sub-needs-4",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        // Override status would otherwise be approval, but SubagentStop forces sub_status=idle.
        CLAUDE_DISPLAY_STATUS: "approval",
        CLAUDE_DISPLAY_NEEDS: "approve-tool",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/sub-needs/stop",
          parent_tool_use_id: "tool-use-sub-4",
          hook_event_name: "SubagentStop",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].parent_id).toBeDefined();
      expect(cap.captured[0].status).toBe("idle");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });
});
