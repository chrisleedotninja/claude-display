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

describe("hook posts identity", () => {
  let handle;
  let baseUrl;
  let received;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    received = [];
  });

  afterEach(() => {
    handle.stop();
  });

  it("posts the expected id, id_raw, and status for hostname:pane:cwd", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    // Don't inherit a real TTY into the script.
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    const expectedRaw = "hostA:%5:/some/dir";
    const expectedId = sha256Prefix(expectedRaw);
    expect(records[0].id_raw).toBe(expectedRaw);
    expect(records[0].id).toBe(expectedId);
    // Per chore [021], the hook now auto-derives "idle" from SessionStart
    // (instead of the legacy literal "active" that the server collapsed).
    expect(records[0].status).toBe("idle");
  });

  it("falls back to TTY when TMUX_PANE is unset", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TTY: "/dev/ttys009",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/x", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    const expectedRaw = "hostA:/dev/ttys009:/x";
    expect(records[0].id_raw).toBe(expectedRaw);
    expect(records[0].id).toBe(sha256Prefix(expectedRaw));
  });

  it("falls back to PPID-N when both TMUX_PANE and TTY are unset", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    // explicitly no TMUX_PANE, no TTY

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/y", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id_raw).toMatch(/^hostA:PPID-\d+:\/y$/);
    expect(records[0].id).toBeString();
    expect(records[0].id.length).toBeGreaterThan(0);
  });

  it("two invocations in the same context produce one record on /api/state", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const stdin = JSON.stringify({ cwd: "/p", hook_event_name: "SessionStart" });

    const first = await runHook({ env, stdin });
    expect(first.exitCode, `stderr: ${first.stderr}`).toBe(0);
    const second = await runHook({ env, stdin });
    expect(second.exitCode, `stderr: ${second.stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    // Per chore [021], SessionStart auto-derives "idle".
    expect(records[0].status).toBe("idle");
  });
});
