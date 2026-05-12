import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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

// Capturing proxy: a minimal Bun.serve that records the raw JSON body the
// hook POSTs to /events. Lets the tests assert on what the *hook* actually
// emitted, before any server-side validation runs. Mirrors the pattern in
// test/hook-status-emit.test.js.
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

describe("hook pre-registers subagent on parent PreToolUse(Task)", () => {
  let cap;

  beforeEach(() => {
    cap = createCaptureServer();
  });

  afterEach(() => {
    cap.stop();
  });

  it("posts a pre-registration body on parent PreToolUse Task", async () => {
    const HOSTNAME = "hostA";
    const TMUX_PANE = "%5";
    const cwd = "/some/dir";
    const toolUseId = "tool-use-abc";
    const description = "audit deps";

    const parentIdRaw = `${HOSTNAME}:${TMUX_PANE}:${cwd}`;
    const parentId = sha256Prefix(parentIdRaw);
    const expectedSubIdRaw = `${parentId}:${toolUseId}`;
    const expectedSubId = sha256Prefix(expectedSubIdRaw);

    const env = {
      PATH: process.env.PATH,
      HOSTNAME,
      TMUX_PANE,
      CLAUDE_DISPLAY_URL: cap.baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "PreToolUse",
        tool_name: "Task",
        tool_use_id: toolUseId,
        tool_input: { description },
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    // Exactly two POSTs on this fire — the existing top-level body AND the
    // new pre-registration body. The two-body assertion guards against the
    // implementer accidentally replacing the existing top-level POST.
    expect(cap.captured).toHaveLength(2);

    const topLevel = cap.captured.find((b) => b.kind === undefined);
    const preReg = cap.captured.find((b) => b.kind === "pre-register");

    expect(topLevel).toBeDefined();
    expect(topLevel.status).toBe("working");
    expect(topLevel.kind).toBeUndefined();

    expect(preReg).toBeDefined();
    expect(preReg.kind).toBe("pre-register");
    expect(preReg.instance).toBe(description);
    expect(preReg.parent_id).toBe(parentId);
    expect(preReg.id).toBe(expectedSubId);
    expect(preReg.id_raw).toBe(expectedSubIdRaw);
  });

  it("pre-registration id matches the subagent's later activity id", async () => {
    // Two hook fires against the same capture server: first the parent's
    // PreToolUse(Task) (which emits the pre-registration), then a subagent
    // activity fire (UserPromptSubmit with parent_tool_use_id set to the
    // same tool_use_id). Both bodies must put the same id / id_raw on the
    // wire — locking the contract that the parent's pre-registration
    // "claims" the same id the subagent's own fires will use.
    const HOSTNAME = "hostA";
    const TMUX_PANE = "%5";
    const cwd = "/some/dir";
    const toolUseId = "tool-use-abc";

    const env = {
      PATH: process.env.PATH,
      HOSTNAME,
      TMUX_PANE,
      CLAUDE_DISPLAY_URL: cap.baseUrl,
    };

    const parentRun = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "PreToolUse",
        tool_name: "Task",
        tool_use_id: toolUseId,
        tool_input: { description: "audit deps" },
      }),
    });
    expect(parentRun.exitCode, `parent stderr: ${parentRun.stderr}`).toBe(0);

    const subagentRun = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "UserPromptSubmit",
        parent_tool_use_id: toolUseId,
      }),
    });
    expect(subagentRun.exitCode, `subagent stderr: ${subagentRun.stderr}`).toBe(0);

    const preReg = cap.captured.find((b) => b.kind === "pre-register");
    expect(preReg, "no pre-registration body captured").toBeDefined();

    // The subagent body has no `kind` field and no `status: "working"` on the
    // top-level body shape — it has `status` plus `parent_id`. Picked by
    // presence of `parent_id` and absence of `kind`.
    const subagentActivity = cap.captured.find(
      (b) => b.kind === undefined && typeof b.parent_id === "string",
    );
    expect(subagentActivity, "no subagent activity body captured").toBeDefined();

    expect(preReg.id).toBe(subagentActivity.id);
    expect(preReg.id_raw).toBe(subagentActivity.id_raw);
  });

  it("does not emit pre-registration when fire is inside a subagent", async () => {
    // Subagent itself fires PreToolUse(Task) for its grandchild — the
    // pre-registration is a parent-side action only, so even with a valid
    // description it must not fire. The existing subagent body POST still
    // fires (status: "working").
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: cap.baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/some/dir",
        hook_event_name: "PreToolUse",
        tool_name: "Task",
        tool_use_id: "tool-use-grandchild",
        parent_tool_use_id: "tool-use-parent",
        tool_input: { description: "nested-desc" },
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    expect(cap.captured).toHaveLength(1);
    expect(cap.captured[0].kind).toBeUndefined();
    expect(cap.captured[0].status).toBe("working");
    expect(typeof cap.captured[0].parent_id).toBe("string");
  });

  it("does not emit pre-registration when tool_name is not Task", async () => {
    // PreToolUse for a non-Task tool (e.g. Bash) is not a subagent spawn —
    // the existing top-level POST still fires, but no pre-registration body
    // is emitted even when tool_input.description is present.
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: cap.baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/some/dir",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "tool-use-bash",
        tool_input: { description: "run a script" },
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    expect(cap.captured).toHaveLength(1);
    expect(cap.captured[0].kind).toBeUndefined();
    expect(cap.captured[0].status).toBe("working");
  });

  it("skips pre-registration when tool_input.description is empty missing or whitespace", async () => {
    // Three variants of "no useful description" — all must collapse to "no
    // pre-registration POST". Each variant uses a distinct cwd so the three
    // runs are independent at the wire level (different parent_id values).
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: cap.baseUrl,
    };

    const variants = [
      // (a) tool_input absent entirely
      {
        cwd: "/no-tool-input",
        stdin: {
          cwd: "/no-tool-input",
          hook_event_name: "PreToolUse",
          tool_name: "Task",
          tool_use_id: "tool-use-a",
        },
      },
      // (b) description empty string
      {
        cwd: "/empty-desc",
        stdin: {
          cwd: "/empty-desc",
          hook_event_name: "PreToolUse",
          tool_name: "Task",
          tool_use_id: "tool-use-b",
          tool_input: { description: "" },
        },
      },
      // (c) description whitespace-only
      {
        cwd: "/whitespace-desc",
        stdin: {
          cwd: "/whitespace-desc",
          hook_event_name: "PreToolUse",
          tool_name: "Task",
          tool_use_id: "tool-use-c",
          tool_input: { description: "   " },
        },
      },
    ];

    for (const variant of variants) {
      const before = cap.captured.length;
      const { exitCode, stderr } = await runHook({
        env: baseEnv,
        stdin: JSON.stringify(variant.stdin),
      });
      expect(exitCode, `${variant.cwd} stderr: ${stderr}`).toBe(0);
      const added = cap.captured.slice(before);
      expect(added, `variant ${variant.cwd} captured wrong count`).toHaveLength(1);
      expect(added[0].kind, `variant ${variant.cwd} kind`).toBeUndefined();
    }
  });
});

describe("hook is resilient on the pre-registration path", () => {
  // Reserved-system port that is unlikely to be in use — same precedent as
  // test/hook-resilience.test.js for the top-level-path coverage.
  const CLOSED_PORT = 7;

  it("exits 0 when server is unreachable on pre-registration path", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%9",
      CLAUDE_DISPLAY_URL: `http://127.0.0.1:${CLOSED_PORT}`,
    };

    const start = Date.now();
    const proc = Bun.spawn([hookPath], {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write(
      JSON.stringify({
        cwd: "/some/dir",
        hook_event_name: "PreToolUse",
        tool_name: "Task",
        tool_use_id: "tool-use-unreach",
        tool_input: { description: "audit deps" },
      }),
    );
    await proc.stdin.end();
    const exitCode = await proc.exited;
    const elapsed = Date.now() - start;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    // Top-level POST + pre-registration POST each cap network wait at ~1s
    // via curl --max-time 1 --connect-timeout 1. 2000ms covers both with
    // slack for bun spawn + shasum + JSON build.
    expect(elapsed).toBeLessThan(2000);
  });
});
