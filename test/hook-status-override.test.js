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

const ENUM_VALUES = [
  "approval",
  "waiting",
  "blocked",
  "working",
  "tests",
  "reviewing",
  "success",
  "idle",
];

describe("valid CLAUDE_DISPLAY_STATUS wins over the static map", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  for (const overrideValue of ENUM_VALUES) {
    it(`emits '${overrideValue}' verbatim when CLAUDE_DISPLAY_STATUS=${overrideValue} and event auto-derives 'working'`, async () => {
      const cwd = `/o/${overrideValue}`;
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: "hostA",
        TMUX_PANE: `%${overrideValue.length}`,
        CLAUDE_DISPLAY_URL: baseUrl,
        CLAUDE_DISPLAY_STATUS: overrideValue,
      };
      const { exitCode, stderr } = await runHook({
        env,
        // PreToolUse auto-derives 'working' — the override must beat that.
        stdin: JSON.stringify({ cwd, hook_event_name: "PreToolUse" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const records = await stateRes.json();
      const rec = records.find((r) => r.id_raw === `hostA:%${overrideValue.length}:${cwd}`);
      expect(rec, `no record for ${overrideValue}`).toBeDefined();
      expect(rec.status).toBe(overrideValue);
    });
  }

  it("emits 'tests' verbatim when CLAUDE_DISPLAY_STATUS=tests and event auto-derives 'idle' (SessionStart)", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%99",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_STATUS: "tests",
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/o-ss", hook_event_name: "SessionStart" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("tests");
  });
});

describe("CLAUDE_DISPLAY_STATUS fall-through", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("invalid override (unknown enum string) falls through to auto-derivation", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%41",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_STATUS: "lolwut",
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/ft-invalid", hook_event_name: "PreToolUse" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("working");
  });

  it("empty override falls through to auto-derivation", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%42",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_STATUS: "",
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/ft-empty", hook_event_name: "PreToolUse" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("working");
  });

  it("unset override falls through to auto-derivation", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%43",
      CLAUDE_DISPLAY_URL: baseUrl,
      // CLAUDE_DISPLAY_STATUS intentionally absent.
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/ft-unset", hook_event_name: "PreToolUse" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("working");
  });
});
