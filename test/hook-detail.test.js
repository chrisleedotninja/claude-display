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

describe("hook posts detail from CLAUDE_DISPLAY_DETAIL", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("posts detail from CLAUDE_DISPLAY_DETAIL on every fired event", async () => {
    const shortDetail =
      "Wants to nuke node_modules to resolve a peer-dep conflict in @stripe/react-stripe-js. Last build failed with ERESOLVE.";
    const longDetail = "y".repeat(5000);

    // First fire: a short value under cwd /a.
    {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: baseUrl,
        CLAUDE_DISPLAY_DETAIL: shortDetail,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/a", hook_event_name: "SessionStart" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    // Second fire: a 5,000-character value under a distinct cwd /b.
    {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: "%9",
        CLAUDE_DISPLAY_URL: baseUrl,
        CLAUDE_DISPLAY_DETAIL: longDetail,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/b", hook_event_name: "SessionStart" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(2);
    const details = records.map((r) => r.detail).sort((a, b) => a.length - b.length);
    expect(details[0]).toBe(shortDetail);
    expect(details[1]).toBe(longDetail);
    expect(details[1].length).toBe(5000);
  });

  it("omits detail when CLAUDE_DISPLAY_DETAIL is unset, empty, or whitespace-only", async () => {
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const stdinFor = (cwd) =>
      JSON.stringify({ cwd, hook_event_name: "SessionStart" });

    // (a) CLAUDE_DISPLAY_DETAIL omitted entirely.
    {
      const env = { ...baseEnv };
      delete env.CLAUDE_DISPLAY_DETAIL;
      const { exitCode, stderr } = await runHook({
        env,
        stdin: stdinFor("/unset"),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }
    // (b) CLAUDE_DISPLAY_DETAIL set to "".
    {
      const env = { ...baseEnv, CLAUDE_DISPLAY_DETAIL: "" };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: stdinFor("/empty"),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }
    // (c) CLAUDE_DISPLAY_DETAIL set to "   " (whitespace only).
    {
      const env = { ...baseEnv, CLAUDE_DISPLAY_DETAIL: "   " };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: stdinFor("/whitespace"),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(3);

    const placeholderSentinels = ["unknown", "-", "n/a", "none"];
    for (const rec of records) {
      expect(rec.detail).toBeUndefined();
      expect(placeholderSentinels).not.toContain(rec.detail);
    }
  });
});
