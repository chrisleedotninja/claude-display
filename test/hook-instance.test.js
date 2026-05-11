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

describe("hook posts instance from CLAUDE_DISPLAY_INSTANCE", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("omits instance when CLAUDE_DISPLAY_INSTANCE is unset or empty", async () => {
    // Two cases: env var omitted entirely, then env var explicitly empty.
    // Each case POSTs under a distinct id (distinct cwd) so both records
    // coexist on /api/state and we can assert each one's omission directly.
    // Neither case should ever produce a placeholder string ("unknown",
    // "-", "n/a", "none") on the record.
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    const unsetRun = await runHook({
      env: baseEnv,
      stdin: JSON.stringify({ cwd: "/cwd-unset", hook_event_name: "SessionStart" }),
    });
    expect(unsetRun.exitCode, `stderr: ${unsetRun.stderr}`).toBe(0);

    const emptyRun = await runHook({
      env: { ...baseEnv, CLAUDE_DISPLAY_INSTANCE: "" },
      stdin: JSON.stringify({ cwd: "/cwd-empty", hook_event_name: "SessionStart" }),
    });
    expect(emptyRun.exitCode, `stderr: ${emptyRun.stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(2);
    for (const rec of records) {
      expect(rec.instance).toBeUndefined();
      expect(["unknown", "-", "n/a", "none"]).not.toContain(rec.instance);
    }
  });

  it("posts instance from CLAUDE_DISPLAY_INSTANCE when the env var is a non-empty string", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_INSTANCE: "cc-payments",
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].instance).toBe("cc-payments");
  });
});
