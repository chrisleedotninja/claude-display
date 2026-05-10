import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
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

// Capturing proxy: a minimal Bun.serve that records the raw JSON body the
// hook POSTs to /events. Lets the tests assert on what the *hook* actually
// emitted, before the real server's enum-collapse step rewrites it.
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

describe("hook auto-derives idle for SessionStart", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("emits status === 'idle' (verbatim, not via server collapse) when hook_event_name is SessionStart", async () => {
    const cap = createCaptureServer();
    try {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: cap.baseUrl,
      };

      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(cap.captured).toHaveLength(1);
      // The hook itself must put "idle" on the wire — not "active" that the
      // server happens to collapse to "idle" via the [017] allow-list.
      expect(cap.captured[0].status).toBe("idle");
    } finally {
      cap.stop();
    }
  });

  it("the resulting record on /api/state has status === 'idle' for SessionStart", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("idle");
  });
});

describe("hook auto-derives working from event name", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  for (const eventName of ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact"]) {
    it(`maps ${eventName} -> 'working'`, async () => {
      const cwd = `/working/${eventName}`;
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: `%${eventName.length}`,
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd, hook_event_name: eventName }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const records = await stateRes.json();
      const rec = records.find((r) => r.id_raw === `hostA:%${eventName.length}:${cwd}`);
      expect(rec, `no record for ${eventName}`).toBeDefined();
      expect(rec.status).toBe("working");
    });
  }
});

describe("hook auto-derives idle for Stop and SubagentStop", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  for (const eventName of ["Stop", "SubagentStop"]) {
    it(`maps ${eventName} -> 'idle'`, async () => {
      const cwd = `/idle/${eventName}`;
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: `%${eventName.length}`,
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd, hook_event_name: eventName }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const records = await stateRes.json();
      const rec = records.find((r) => r.id_raw === `hostA:%${eventName.length}:${cwd}`);
      expect(rec, `no record for ${eventName}`).toBeDefined();
      expect(rec.status).toBe("idle");
    });
  }
});

describe("Notification with permission message auto-derives approval", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("maps Notification with a 'permission' message -> 'approval'", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%10",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/n",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("approval");
  });

  it("treats the 'permission' substring case-insensitively", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%11",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/n-upper",
        hook_event_name: "Notification",
        message: "PERMISSION required",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("approval");
  });
});

describe("Notification without permission message auto-derives waiting", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("maps Notification with a non-permission message -> 'waiting'", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%12",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/n2",
        hook_event_name: "Notification",
        message: "Claude is waiting for your input",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("waiting");
  });

  it("treats an absent message field as not matching the permission probe", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%13",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      // No `message` field at all.
      stdin: JSON.stringify({ cwd: "/n3", hook_event_name: "Notification" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("waiting");
  });
});

describe("SessionEnd produces no POST", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("exits 0 and creates no record when hook_event_name is SessionEnd and no override is set", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%14",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/end", hook_event_name: "SessionEnd" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toEqual([]);
  });
});
