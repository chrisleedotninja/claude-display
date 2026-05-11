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

describe("hook auto-derives title from Notification.message on the permission discriminator", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("auto-derives title from Notification.message verbatim (preserving original case) when CLAUDE_DISPLAY_TITLE is unset", async () => {
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%t1",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env: baseEnv,
      stdin: JSON.stringify({
        cwd: "/auto/perm",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    // Verbatim — including the original case (NOT lowercased).
    expect(records[0].title).toBe("Claude needs your permission to use Bash");
  });

  it("emits no title on a Notification whose message does NOT contain 'permission' (case-insensitive)", async () => {
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%t2",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const { exitCode, stderr } = await runHook({
      env: baseEnv,
      stdin: JSON.stringify({
        cwd: "/auto/no-perm",
        hook_event_name: "Notification",
        message: "Claude is waiting for your input",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].title).toBeUndefined();
  });

  it("emits no title on a non-Notification event with CLAUDE_DISPLAY_TITLE unset (no auto-derivation source)", async () => {
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%t3",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const sessionStartRun = await runHook({
      env: baseEnv,
      stdin: JSON.stringify({ cwd: "/auto/sess", hook_event_name: "SessionStart" }),
    });
    expect(sessionStartRun.exitCode, `stderr: ${sessionStartRun.stderr}`).toBe(0);

    const userPromptRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%t4" },
      stdin: JSON.stringify({ cwd: "/auto/prompt", hook_event_name: "UserPromptSubmit" }),
    });
    expect(userPromptRun.exitCode, `stderr: ${userPromptRun.stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(2);
    for (const rec of records) {
      expect(rec.title).toBeUndefined();
      // Never a sentinel placeholder string.
      expect(["unknown", "-", "n/a", "none"]).not.toContain(rec.title);
    }
  });
});

describe("hook CLAUDE_DISPLAY_TITLE override wins verbatim on every event type", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("CLAUDE_DISPLAY_TITLE override beats the Notification.message auto-derivation AND fires on non-Notification events", async () => {
    // Two distinct cwds → two distinct records on /api/state. Both must
    // carry the override verbatim, even though one is a Notification +
    // permission event (where the auto-derivation would otherwise fire) and
    // the other is a SessionStart (no auto-derivation source at all).
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_TITLE: "Reviewing PR #42",
    };

    const notifRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%ovr1" },
      stdin: JSON.stringify({
        cwd: "/override/notif",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(notifRun.exitCode, `stderr: ${notifRun.stderr}`).toBe(0);

    const sessRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%ovr2" },
      stdin: JSON.stringify({ cwd: "/override/sess", hook_event_name: "SessionStart" }),
    });
    expect(sessRun.exitCode, `stderr: ${sessRun.stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(2);
    for (const rec of records) {
      expect(rec.title).toBe("Reviewing PR #42");
    }
  });
});

describe("hook treats unset, empty, or whitespace-only CLAUDE_DISPLAY_TITLE as no override", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("falls through to the Notification.message auto-derivation when the override is unset, empty, or whitespace-only — and emits no title on a non-Notification event paired with a whitespace-only override", async () => {
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const permStdin = JSON.stringify({
      cwd: "WILL_BE_OVERRIDDEN",
      hook_event_name: "Notification",
      message: "Claude needs your permission to use Bash",
    });

    // (a) override env var omitted entirely
    const unsetRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%fall1" },
      stdin: JSON.stringify({
        cwd: "/fall/unset",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(unsetRun.exitCode, `stderr: ${unsetRun.stderr}`).toBe(0);

    // (b) override explicitly empty string
    const emptyRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%fall2", CLAUDE_DISPLAY_TITLE: "" },
      stdin: JSON.stringify({
        cwd: "/fall/empty",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(emptyRun.exitCode, `stderr: ${emptyRun.stderr}`).toBe(0);

    // (c) whitespace-only override (three spaces)
    const wsRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%fall3", CLAUDE_DISPLAY_TITLE: "   " },
      stdin: JSON.stringify({
        cwd: "/fall/ws",
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
      }),
    });
    expect(wsRun.exitCode, `stderr: ${wsRun.stderr}`).toBe(0);

    // (d) whitespace-only override on a non-Notification event — no auto-
    //     derivation source, so no title on the wire
    const wsSessRun = await runHook({
      env: { ...baseEnv, TMUX_PANE: "%fall4", CLAUDE_DISPLAY_TITLE: "   " },
      stdin: JSON.stringify({ cwd: "/fall/ws-sess", hook_event_name: "SessionStart" }),
    });
    expect(wsSessRun.exitCode, `stderr: ${wsSessRun.stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(4);

    const byCwd = (cwd) => records.find((r) => r.id_raw && r.id_raw.endsWith(cwd));
    expect(byCwd("/fall/unset").title).toBe("Claude needs your permission to use Bash");
    expect(byCwd("/fall/empty").title).toBe("Claude needs your permission to use Bash");
    expect(byCwd("/fall/ws").title).toBe("Claude needs your permission to use Bash");
    expect(byCwd("/fall/ws-sess").title).toBeUndefined();
    // suppress unused warning
    void permStdin;
  });
});
