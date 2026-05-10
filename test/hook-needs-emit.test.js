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

// Capturing proxy: a minimal Bun.serve that records the raw JSON body the hook
// POSTs to /events. Lets the tests assert on what the *hook* actually emitted,
// before the real server's `needs` allow-list rewrites/strips it. Mirrors
// test/hook-status-emit.test.js's createCaptureServer.
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

const NEEDS_ENUM = [
  "approve-tool",
  "answer-question",
  "provide-input",
  "pick-option",
  "confirm-destructive",
  "resolve-conflict",
  "review-diff",
];

describe("CLAUDE_DISPLAY_NEEDS override emits needs verbatim on attention-state events", () => {
  for (const overrideValue of NEEDS_ENUM) {
    it(`emits needs === '${overrideValue}' on the wire when CLAUDE_DISPLAY_NEEDS=${overrideValue} and resolved status is 'approval'`, async () => {
      const cap = createCaptureServer();
      try {
        const env = {
          PATH: process.env.PATH,
          HOSTNAME: "hostA",
          TMUX_PANE: `%${overrideValue.length}`,
          CLAUDE_DISPLAY_URL: cap.baseUrl,
          CLAUDE_DISPLAY_STATUS: "approval",
          CLAUDE_DISPLAY_NEEDS: overrideValue,
        };
        const { exitCode, stderr } = await runHook({
          env,
          // PreToolUse + status override 'approval' → resolved status is
          // 'approval' (an attention-state value), so the needs filter passes.
          stdin: JSON.stringify({ cwd: `/needs/${overrideValue}`, hook_event_name: "PreToolUse" }),
        });
        expect(exitCode, `stderr: ${stderr}`).toBe(0);
        expect(cap.captured).toHaveLength(1);
        expect(cap.captured[0].needs).toBe(overrideValue);
      } finally {
        cap.stop();
      }
    });
  }
});

describe("CLAUDE_DISPLAY_NEEDS override is dropped on non-attention-state events", () => {
  // The status filter (ADR 0003) gates `needs` to only the three attention-state
  // values: approval, waiting, blocked. A valid override paired with any other
  // resolved status must NOT cause `needs` to appear on the wire — the override
  // has no power to bypass the filter.
  it("drops needs when resolved status is 'working' (PreToolUse, no status override)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%200",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_NEEDS: "approve-tool",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/needs-drop/working", hook_event_name: "PreToolUse" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("working");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });

  it("drops needs when resolved status is 'idle' (SessionStart)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%201",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_NEEDS: "answer-question",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/needs-drop/idle", hook_event_name: "SessionStart" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("idle");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });

  it("drops needs when resolved status is 'tests' (CLAUDE_DISPLAY_STATUS=tests)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%202",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_STATUS: "tests",
        CLAUDE_DISPLAY_NEEDS: "review-diff",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/needs-drop/tests", hook_event_name: "PreToolUse" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("tests");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });
});

describe("invalid CLAUDE_DISPLAY_NEEDS falls through silently", () => {
  // ADR 0003: unset, empty, or any string outside the seven-value enum is
  // silently treated as if not set. No error is raised. The hook still emits
  // the rest of its payload normally; on an attention-state status with no
  // auto-derivation match (Notification + non-permission message → waiting),
  // `needs` MUST NOT appear on the wire — the unknown string never leaks.
  for (const [label, envOverride] of [
    ["unset", null],
    ["empty string", ""],
    ["unknown string", "make-coffee"],
  ]) {
    it(`emits no needs when CLAUDE_DISPLAY_NEEDS is ${label} on a Notification → waiting event`, async () => {
      const cap = createCaptureServer();
      try {
        const env = {
          PATH: process.env.PATH,
          HOSTNAME: "hostA",
          TMUX_PANE: `%fall${label.length}`,
          CLAUDE_DISPLAY_URL: cap.baseUrl,
        };
        if (envOverride !== null) {
          env.CLAUDE_DISPLAY_NEEDS = envOverride;
        }
        const { exitCode, stderr } = await runHook({
          env,
          // Notification with a non-permission message → status 'waiting'
          // (attention-state, so the filter would *attach* needs if any value
          // had been derived). Auto-derivation table has no row for this case,
          // so the only way needs could appear is via the override — which is
          // invalid in each of these three cases.
          stdin: JSON.stringify({
            cwd: `/fallthrough/${label.replace(/\s+/g, "-")}`,
            hook_event_name: "Notification",
            message: "Claude is waiting for your input",
          }),
        });
        expect(exitCode, `stderr: ${stderr}`).toBe(0);
        expect(cap.captured).toHaveLength(1);
        expect(cap.captured[0].status).toBe("waiting");
        expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
      } finally {
        cap.stop();
      }
    });
  }
});

describe("Notification + permission message auto-derives needs='approve-tool'", () => {
  // ADR 0003 per-event auto-derivation table: only one row auto-emits a value —
  // Notification whose `message` contains `permission` (case-insensitive) →
  // `approve-tool`. The same Notification without `permission` emits no
  // auto-derived `needs` (already locked by Step 3's tests).
  it("emits needs='approve-tool' on Notification + 'permission' (lowercase substring)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%auto1",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/auto/permission",
          hook_event_name: "Notification",
          message: "Claude needs your permission to use Bash",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("approval");
      expect(cap.captured[0].needs).toBe("approve-tool");
    } finally {
      cap.stop();
    }
  });

  it("auto-derivation is case-insensitive — 'PERMISSION' substring emits needs='approve-tool'", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%auto2",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/auto/PERMISSION",
          hook_event_name: "Notification",
          message: "PERMISSION required",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("approval");
      expect(cap.captured[0].needs).toBe("approve-tool");
    } finally {
      cap.stop();
    }
  });

  it("Notification without 'permission' substring emits no auto-derived needs (waiting status)", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%auto3",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/auto/no-permission",
          hook_event_name: "Notification",
          message: "Claude is waiting for your input",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      expect(cap.captured[0].status).toBe("waiting");
      expect(Object.hasOwn(cap.captured[0], "needs")).toBe(false);
    } finally {
      cap.stop();
    }
  });
});

describe("resilience and identity preserved with needs in the mix", () => {
  // Closed high port outside the dynamic range (mirrors test/hook-resilience.test.js).
  const CLOSED_PORT = 7;

  it("exits 0 within ~2s when the server is unreachable, even with CLAUDE_DISPLAY_NEEDS set", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%9",
      CLAUDE_DISPLAY_URL: `http://127.0.0.1:${CLOSED_PORT}`,
      CLAUDE_DISPLAY_STATUS: "approval",
      CLAUDE_DISPLAY_NEEDS: "approve-tool",
    };

    const start = Date.now();
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/q-needs",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    const elapsed = Date.now() - start;

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    // curl --max-time 1 --connect-timeout 1 caps the network wait at ~1s;
    // 2000ms gives plenty of slack for the bun spawn + shasum + JSON build.
    expect(elapsed).toBeLessThan(2000);
  });

  it("per-session id is identical with and without CLAUDE_DISPLAY_NEEDS for the same HOSTNAME/TMUX_PANE/cwd", async () => {
    const cap = createCaptureServer();
    try {
      const sharedCwd = "/identity/needs-stable";
      const baseEnv = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%identity",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
        CLAUDE_DISPLAY_STATUS: "approval",
      };

      // Run 1: needs unset.
      const r1 = await runHook({
        env: baseEnv,
        stdin: JSON.stringify({ cwd: sharedCwd, hook_event_name: "PreToolUse" }),
      });
      expect(r1.exitCode, `stderr: ${r1.stderr}`).toBe(0);

      // Run 2: same identity, with a valid needs override.
      const r2 = await runHook({
        env: { ...baseEnv, CLAUDE_DISPLAY_NEEDS: "approve-tool" },
        stdin: JSON.stringify({ cwd: sharedCwd, hook_event_name: "PreToolUse" }),
      });
      expect(r2.exitCode, `stderr: ${r2.stderr}`).toBe(0);

      expect(cap.captured).toHaveLength(2);
      expect(cap.captured[0].id).toBe(cap.captured[1].id);
      expect(cap.captured[0].id_raw).toBe(cap.captured[1].id_raw);
    } finally {
      cap.stop();
    }
  });
});
