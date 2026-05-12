import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

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

describe("hook auto-derives instance from the matching session file", () => {
  let handle;
  let baseUrl;
  let homeDir;
  let sessionsDir;

  beforeEach(async () => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    homeDir = await mkdtemp(join(tmpdir(), "claude-display-home-"));
    sessionsDir = join(homeDir, ".claude", "sessions");
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    handle.stop();
    if (homeDir) await rm(homeDir, { recursive: true, force: true });
  });

  it("auto-derives instance from the matching session file when env var is unset", async () => {
    await writeFile(
      join(sessionsDir, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
    );

    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: homeDir,
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/cwd-auto-1",
        hook_event_name: "SessionStart",
        session_id: "UUID-A",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].instance).toBe("charlie");
  });

  it("env var overrides the auto-derived value verbatim", async () => {
    await writeFile(
      join(sessionsDir, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
    );

    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: homeDir,
      CLAUDE_DISPLAY_INSTANCE: "cc-alpha",
    };

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd: "/cwd-override-1",
        hook_event_name: "SessionStart",
        session_id: "UUID-A",
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].instance).toBe("cc-alpha");
  });

  it("omits instance when neither env var nor a matching session file is present", async () => {
    // Case 1: ~/.claude/sessions/ directory missing entirely.
    const homeNoSessionsDir = await mkdtemp(
      join(tmpdir(), "claude-display-home-no-sessions-")
    );
    // intentionally do NOT create .claude/sessions

    // Case 2: directory exists but has no .json files (use shared homeDir
    // before we drop files into it).
    // (sessionsDir is already created empty in beforeEach.)

    // Case 3: directory has a file whose sessionId doesn't match.
    const homeMismatchDir = await mkdtemp(
      join(tmpdir(), "claude-display-home-mismatch-")
    );
    const mismatchSessions = join(homeMismatchDir, ".claude", "sessions");
    await mkdir(mismatchSessions, { recursive: true });
    await writeFile(
      join(mismatchSessions, "12345.json"),
      JSON.stringify({ sessionId: "UUID-OTHER", name: "charlie" })
    );

    // Case 4: stdin payload has no session_id; session file exists with a
    // name. Reuse a fresh HOME so the cases don't share state.
    const homeNoStdinDir = await mkdtemp(
      join(tmpdir(), "claude-display-home-no-stdin-")
    );
    const noStdinSessions = join(homeNoStdinDir, ".claude", "sessions");
    await mkdir(noStdinSessions, { recursive: true });
    await writeFile(
      join(noStdinSessions, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
    );

    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    try {
      const r1 = await runHook({
        env: { ...baseEnv, HOME: homeNoSessionsDir },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-1",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r1.exitCode, `case 1 stderr: ${r1.stderr}`).toBe(0);

      const r2 = await runHook({
        env: { ...baseEnv, HOME: homeDir },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-2",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r2.exitCode, `case 2 stderr: ${r2.stderr}`).toBe(0);

      const r3 = await runHook({
        env: { ...baseEnv, HOME: homeMismatchDir },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-3",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r3.exitCode, `case 3 stderr: ${r3.stderr}`).toBe(0);

      const r4 = await runHook({
        env: { ...baseEnv, HOME: homeNoStdinDir },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-4",
          hook_event_name: "SessionStart",
        }),
      });
      expect(r4.exitCode, `case 4 stderr: ${r4.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(4);
      const forbidden = ["unknown", "-", "n/a", "none"];
      for (const rec of records) {
        expect(rec.instance).toBeUndefined();
        expect(forbidden).not.toContain(rec.instance);
      }
    } finally {
      await rm(homeNoSessionsDir, { recursive: true, force: true });
      await rm(homeMismatchDir, { recursive: true, force: true });
      await rm(homeNoStdinDir, { recursive: true, force: true });
    }
  });

  it("tolerates malformed session JSON without leaking error output or attaching instance", async () => {
    // Case A: file is not JSON at all.
    await writeFile(join(sessionsDir, "12345.json"), "not-json");

    const envA = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: homeDir,
    };

    const a = await runHook({
      env: envA,
      stdin: JSON.stringify({
        cwd: "/cwd-malformed-a",
        hook_event_name: "SessionStart",
        session_id: "UUID-A",
      }),
    });
    expect(a.exitCode, `case A stderr: ${a.stderr}`).toBe(0);
    expect(a.stderr).not.toMatch(/SyntaxError/);
    expect(a.stderr).not.toMatch(/JSON\.parse/);
    expect(a.stderr).not.toMatch(/Unhandled/i);

    // Case B: well-formed JSON whose sessionId matches but `name` is not a string.
    const homeBDir = await mkdtemp(join(tmpdir(), "claude-display-home-b-"));
    const sessionsB = join(homeBDir, ".claude", "sessions");
    await mkdir(sessionsB, { recursive: true });
    await writeFile(
      join(sessionsB, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: null })
    );

    try {
      const b = await runHook({
        env: { ...envA, HOME: homeBDir },
        stdin: JSON.stringify({
          cwd: "/cwd-malformed-b",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(b.exitCode, `case B stderr: ${b.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(2);
      for (const rec of records) {
        expect(rec.instance).toBeUndefined();
      }
    } finally {
      await rm(homeBDir, { recursive: true, force: true });
    }
  });

  it("stays under the budget with 50 session files", async () => {
    // 49 non-matching + 1 matching.
    const writes = [];
    for (let i = 0; i < 49; i++) {
      writes.push(
        writeFile(
          join(sessionsDir, `noise-${i}.json`),
          JSON.stringify({ sessionId: `UUID-NOISE-${i}`, name: `noise-${i}` })
        )
      );
    }
    writes.push(
      writeFile(
        join(sessionsDir, "match.json"),
        JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
      )
    );
    await Promise.all(writes);

    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: homeDir,
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
        cwd: "/cwd-budget-1",
        hook_event_name: "SessionStart",
        session_id: "UUID-A",
      })
    );
    await proc.stdin.end();
    const exitCode = await proc.exited;
    const elapsed = Date.now() - start;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(elapsed).toBeLessThan(1000);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].instance).toBe("charlie");
  });
});
