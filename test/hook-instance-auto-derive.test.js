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

  it("session-file name wins over CLAUDE_DISPLAY_INSTANCE", async () => {
    // Case A: env-set half of AC1 — session-file name still wins, env var is ignored.
    await writeFile(
      join(sessionsDir, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
    );

    const envA = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: homeDir,
      CLAUDE_DISPLAY_INSTANCE: "cc-alpha",
    };

    const a = await runHook({
      env: envA,
      stdin: JSON.stringify({
        cwd: "/cwd-name-wins-a",
        hook_event_name: "SessionStart",
        session_id: "UUID-A",
      }),
    });
    expect(a.exitCode, `case A stderr: ${a.stderr}`).toBe(0);

    // Case B: whitespace around `name` in session file is trimmed in the
    // emitted value (preserves 081's trim-on-extract posture).
    const homeBDir = await mkdtemp(
      join(tmpdir(), "claude-display-home-trim-")
    );
    const sessionsB = join(homeBDir, ".claude", "sessions");
    await mkdir(sessionsB, { recursive: true });
    await writeFile(
      join(sessionsB, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "  charlie  " })
    );

    try {
      const b = await runHook({
        env: { ...envA, HOME: homeBDir },
        stdin: JSON.stringify({
          cwd: "/cwd-name-wins-b",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(b.exitCode, `case B stderr: ${b.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(2);
      const byCwd = Object.fromEntries(records.map((r) => [r.id_raw, r]));
      // We can't easily key by id without recomputing the shasum; instead
      // assert both records have instance === "charlie".
      for (const rec of records) {
        expect(rec.instance).toBe("charlie");
      }
    } finally {
      await rm(homeBDir, { recursive: true, force: true });
    }
  });

  it("CLAUDE_DISPLAY_INSTANCE is used when no session-file name is available", async () => {
    // Each sub-case must emit instance === "cc-alpha" (env var verbatim).
    // Sub-case 1: no ~/.claude/sessions/ directory.
    const home1 = await mkdtemp(
      join(tmpdir(), "claude-display-home-env-1-")
    );
    // intentionally do NOT create .claude/sessions

    // Sub-case 2: ~/.claude/sessions/ exists but is empty (reuse shared homeDir).

    // Sub-case 3: session file exists with a non-matching sessionId.
    const home3 = await mkdtemp(
      join(tmpdir(), "claude-display-home-env-3-")
    );
    const sessions3 = join(home3, ".claude", "sessions");
    await mkdir(sessions3, { recursive: true });
    await writeFile(
      join(sessions3, "12345.json"),
      JSON.stringify({ sessionId: "UUID-OTHER", name: "charlie" })
    );

    // Sub-case 4: session file matches sessionId but `name` is null.
    const home4 = await mkdtemp(
      join(tmpdir(), "claude-display-home-env-4-")
    );
    const sessions4 = join(home4, ".claude", "sessions");
    await mkdir(sessions4, { recursive: true });
    await writeFile(
      join(sessions4, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: null })
    );

    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      CLAUDE_DISPLAY_INSTANCE: "cc-alpha",
    };

    try {
      const r1 = await runHook({
        env: { ...baseEnv, HOME: home1 },
        stdin: JSON.stringify({
          cwd: "/cwd-env-1",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r1.exitCode, `case 1 stderr: ${r1.stderr}`).toBe(0);

      const r2 = await runHook({
        env: { ...baseEnv, HOME: homeDir },
        stdin: JSON.stringify({
          cwd: "/cwd-env-2",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r2.exitCode, `case 2 stderr: ${r2.stderr}`).toBe(0);

      const r3 = await runHook({
        env: { ...baseEnv, HOME: home3 },
        stdin: JSON.stringify({
          cwd: "/cwd-env-3",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r3.exitCode, `case 3 stderr: ${r3.stderr}`).toBe(0);

      const r4 = await runHook({
        env: { ...baseEnv, HOME: home4 },
        stdin: JSON.stringify({
          cwd: "/cwd-env-4",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r4.exitCode, `case 4 stderr: ${r4.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(4);
      const forbidden = ["unknown", "-", "n/a", "none"];
      for (const rec of records) {
        expect(rec.instance).toBe("cc-alpha");
        expect(forbidden).not.toContain(rec.instance);
      }
    } finally {
      await rm(home1, { recursive: true, force: true });
      await rm(home3, { recursive: true, force: true });
      await rm(home4, { recursive: true, force: true });
    }
  });

  it("CLAUDE_DISPLAY_INSTANCE beats stdin session_id when both are present and no session-file name matches", async () => {
    // No ~/.claude/sessions/ directory, env var set, stdin session_id set.
    // Env var must win — session_id is the LAST-resort fallback.
    const home = await mkdtemp(
      join(tmpdir(), "claude-display-home-env-beats-sid-")
    );

    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
      HOME: home,
      CLAUDE_DISPLAY_INSTANCE: "cc-alpha",
    };

    try {
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd: "/cwd-env-beats-sid",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(1);
      expect(records[0].instance).toBe("cc-alpha");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("session_id from stdin is the last-resort fallback", async () => {
    // Each sub-case must emit instance === "UUID-A" (stdin session_id verbatim).
    // Sub-case 1: env var unset, no ~/.claude/sessions/ directory.
    const home1 = await mkdtemp(
      join(tmpdir(), "claude-display-home-sid-1-")
    );
    // intentionally do NOT create .claude/sessions

    // Sub-case 2: env var set to "" (explicitly empty), session file present
    // with non-matching sessionId.
    const home2 = await mkdtemp(
      join(tmpdir(), "claude-display-home-sid-2-")
    );
    const sessions2 = join(home2, ".claude", "sessions");
    await mkdir(sessions2, { recursive: true });
    await writeFile(
      join(sessions2, "12345.json"),
      JSON.stringify({ sessionId: "UUID-OTHER", name: "charlie" })
    );

    // Sub-case 3: env var set to whitespace-only (falls through the trim
    // gate), session file matches sessionId but `name` is null.
    const home3 = await mkdtemp(
      join(tmpdir(), "claude-display-home-sid-3-")
    );
    const sessions3 = join(home3, ".claude", "sessions");
    await mkdir(sessions3, { recursive: true });
    await writeFile(
      join(sessions3, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: null })
    );

    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    try {
      const r1 = await runHook({
        env: { ...baseEnv, HOME: home1 },
        stdin: JSON.stringify({
          cwd: "/cwd-sid-1",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r1.exitCode, `case 1 stderr: ${r1.stderr}`).toBe(0);

      const r2 = await runHook({
        env: { ...baseEnv, HOME: home2, CLAUDE_DISPLAY_INSTANCE: "" },
        stdin: JSON.stringify({
          cwd: "/cwd-sid-2",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r2.exitCode, `case 2 stderr: ${r2.stderr}`).toBe(0);

      const r3 = await runHook({
        env: { ...baseEnv, HOME: home3, CLAUDE_DISPLAY_INSTANCE: "   " },
        stdin: JSON.stringify({
          cwd: "/cwd-sid-3",
          hook_event_name: "SessionStart",
          session_id: "UUID-A",
        }),
      });
      expect(r3.exitCode, `case 3 stderr: ${r3.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(3);
      for (const rec of records) {
        expect(rec.instance).toBe("UUID-A");
      }
    } finally {
      await rm(home1, { recursive: true, force: true });
      await rm(home2, { recursive: true, force: true });
      await rm(home3, { recursive: true, force: true });
    }
  });

  it("field is omitted only when all three signals are absent", async () => {
    // Each sub-case must emit a record whose instance field is undefined.
    // Sub-case 1: env unset, no ~/.claude/sessions/ dir, stdin has no session_id key.
    const home1 = await mkdtemp(
      join(tmpdir(), "claude-display-home-omit-1-")
    );
    // intentionally do NOT create .claude/sessions

    // Sub-case 2: env unset, session file exists with matching sessionId AND
    // non-blank name, BUT stdin has no session_id key (so the lookup never
    // fires — the session file can't save the resolution).
    const home2 = await mkdtemp(
      join(tmpdir(), "claude-display-home-omit-2-")
    );
    const sessions2 = join(home2, ".claude", "sessions");
    await mkdir(sessions2, { recursive: true });
    await writeFile(
      join(sessions2, "12345.json"),
      JSON.stringify({ sessionId: "UUID-A", name: "charlie" })
    );

    // Sub-case 3: env unset, no ~/.claude/sessions/ dir, stdin session_id is "".
    const home3 = await mkdtemp(
      join(tmpdir(), "claude-display-home-omit-3-")
    );
    // intentionally do NOT create .claude/sessions

    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    try {
      const r1 = await runHook({
        env: { ...baseEnv, HOME: home1 },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-1",
          hook_event_name: "SessionStart",
        }),
      });
      expect(r1.exitCode, `case 1 stderr: ${r1.stderr}`).toBe(0);

      const r2 = await runHook({
        env: { ...baseEnv, HOME: home2 },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-2",
          hook_event_name: "SessionStart",
        }),
      });
      expect(r2.exitCode, `case 2 stderr: ${r2.stderr}`).toBe(0);

      const r3 = await runHook({
        env: { ...baseEnv, HOME: home3 },
        stdin: JSON.stringify({
          cwd: "/cwd-omit-3",
          hook_event_name: "SessionStart",
          session_id: "",
        }),
      });
      expect(r3.exitCode, `case 3 stderr: ${r3.stderr}`).toBe(0);

      const records = await (await fetch(`${baseUrl}/api/state`)).json();
      expect(records).toHaveLength(3);
      const forbidden = ["unknown", "-", "n/a", "none"];
      for (const rec of records) {
        expect(rec.instance).toBeUndefined();
        expect(forbidden).not.toContain(rec.instance);
      }
    } finally {
      await rm(home1, { recursive: true, force: true });
      await rm(home2, { recursive: true, force: true });
      await rm(home3, { recursive: true, force: true });
    }
  });

  it("tolerates malformed session JSON without leaking error output, and falls through to the session_id", async () => {
    // Case A: file is not JSON at all. The lookup branch silently swallows
    // the SyntaxError; with no env var set, the session_id fallback fires
    // and instance === "UUID-A".
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

    // Case B: well-formed JSON whose sessionId matches but `name` is not a
    // string. Lookup yields empty, env unset, so session_id fallback fires
    // and instance === "UUID-A".
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
        expect(rec.instance).toBe("UUID-A");
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
