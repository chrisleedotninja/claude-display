import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unlinkSync } from "node:fs";
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

// Strip any stale stash file for a given env's effective shell_id so a
// previous run doesn't bleed into the next test. The hook hashes
// `${HOSTNAME}:${pane_or_tty}:${cwd}` with sha256 and takes the first 8 chars.
async function shellIdFor({ hostname, pane, cwd }) {
  const raw = `${hostname}:${pane}:${cwd}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(raw);
  return hasher.digest("hex").slice(0, 8);
}

async function clearStash({ hostname, pane, cwd }) {
  const id = await shellIdFor({ hostname, pane, cwd });
  const stashTmp = process.env.TMPDIR || "/tmp";
  const path = join(stashTmp, `claude-display-prompt-${id}`);
  try {
    unlinkSync(path);
  } catch {}
}

describe("hook stashes UserPromptSubmit prompt and forwards as detail", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("exits 0 under missing prompt, missing stash, and unreachable server", async () => {
    const hostname = "hostA";

    // (a) UserPromptSubmit with no `prompt` field on stdin.
    {
      const pane = "%301";
      const cwd = "/r1";
      await clearStash({ hostname, pane, cwd });
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: hostname,
        TMUX_PANE: pane,
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd, hook_event_name: "UserPromptSubmit" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    // (b) Non-UserPromptSubmit fire with no prior stash for this session.
    {
      const pane = "%302";
      const cwd = "/r2";
      await clearStash({ hostname, pane, cwd });
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: hostname,
        TMUX_PANE: pane,
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    // (c) Server unreachable but still exits 0 (CLOSED_PORT 7 mirrors
    // hook-resilience.test.js).
    {
      const pane = "%303";
      const cwd = "/r3";
      await clearStash({ hostname, pane, cwd });
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: hostname,
        TMUX_PANE: pane,
        CLAUDE_DISPLAY_URL: "http://127.0.0.1:7",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "still resilient",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }
  });

  it("two concurrent sessions keep independent stashes", async () => {
    const hostname = "hostA";
    const paneA = "%201";
    const cwdA = "/sA";
    const paneB = "%202";
    const cwdB = "/sB";
    await clearStash({ hostname, pane: paneA, cwd: cwdA });
    await clearStash({ hostname, pane: paneB, cwd: cwdB });

    const envA = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: paneA,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const envB = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: paneB,
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    // A submits its prompt.
    {
      const { exitCode } = await runHook({
        env: envA,
        stdin: JSON.stringify({
          cwd: cwdA,
          hook_event_name: "UserPromptSubmit",
          prompt: "alpha task",
        }),
      });
      expect(exitCode).toBe(0);
    }
    // B submits its prompt.
    {
      const { exitCode } = await runHook({
        env: envB,
        stdin: JSON.stringify({
          cwd: cwdB,
          hook_event_name: "UserPromptSubmit",
          prompt: "bravo task",
        }),
      });
      expect(exitCode).toBe(0);
    }
    // A follow-up fire (no prompt) — should still see alpha.
    {
      const { exitCode } = await runHook({
        env: envA,
        stdin: JSON.stringify({
          cwd: cwdA,
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
        }),
      });
      expect(exitCode).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(2);
    const byDetail = Object.fromEntries(records.map((r) => [r.detail, r]));
    expect(byDetail["alpha task"]).toBeDefined();
    expect(byDetail["bravo task"]).toBeDefined();
    // No cross-contamination: neither session's detail appears under the other's id.
    expect(byDetail["alpha task"].id).not.toBe(byDetail["bravo task"].id);
  });

  it("CLAUDE_DISPLAY_DETAIL override beats the stashed prompt", async () => {
    const hostname = "hostA";
    const pane = "%106";
    const cwd = "/p6";
    await clearStash({ hostname, pane, cwd });

    // Stash a prompt first.
    {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: hostname,
        TMUX_PANE: pane,
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "stashed prompt",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }
    // Follow-up fire with env override.
    {
      const env = {
        PATH: process.env.PATH,
        HOSTNAME: hostname,
        TMUX_PANE: pane,
        CLAUDE_DISPLAY_URL: baseUrl,
        CLAUDE_DISPLAY_DETAIL: "override wins",
      };
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe("override wins");
  });

  it("second UserPromptSubmit replaces the stashed value", async () => {
    const hostname = "hostA";
    const pane = "%105";
    const cwd = "/p5";
    await clearStash({ hostname, pane, cwd });

    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: pane,
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    // First UserPromptSubmit.
    {
      const { exitCode, stderr } = await runHook({
        env: baseEnv,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "first prompt",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }
    // Second UserPromptSubmit with a different prompt.
    {
      const { exitCode, stderr } = await runHook({
        env: baseEnv,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "second prompt",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe("second prompt");
  });

  it("subsequent same-session fires reuse the stashed detail", async () => {
    const hostname = "hostA";
    const pane = "%104";
    const cwd = "/p4";
    await clearStash({ hostname, pane, cwd });

    const promptText = "ship the feature";
    const baseEnv = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: pane,
      CLAUDE_DISPLAY_URL: baseUrl,
    };

    // UserPromptSubmit stashes the prompt.
    {
      const { exitCode, stderr } = await runHook({
        env: baseEnv,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: promptText,
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    // PreToolUse fires next, no prompt field in stdin.
    {
      const { exitCode, stderr } = await runHook({
        env: baseEnv,
        stdin: JSON.stringify({
          cwd,
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
        }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe(promptText);
  });

  it("first line over 200 chars caps at 200 plus ellipsis", async () => {
    const hostname = "hostA";
    const pane = "%103";
    const cwd = "/p3";
    await clearStash({ hostname, pane, cwd });

    const promptText = "x".repeat(250);
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: pane,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "UserPromptSubmit",
        prompt: promptText,
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe("x".repeat(200) + "…");
    expect(Array.from(records[0].detail).length).toBe(201);
  });

  it("multi-line prompt collapses to first line with ellipsis", async () => {
    const hostname = "hostA";
    const pane = "%102";
    const cwd = "/p2";
    await clearStash({ hostname, pane, cwd });

    const promptText = "first line of the prompt\nsecond line should be dropped\nthird line";
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: pane,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "UserPromptSubmit",
        prompt: promptText,
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe("first line of the prompt…");
  });

  it("forwards a short single-line prompt verbatim as detail", async () => {
    const hostname = "hostA";
    const pane = "%101";
    const cwd = "/p1";
    await clearStash({ hostname, pane, cwd });

    const promptText = "make the dashboard show the prompt";
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: hostname,
      TMUX_PANE: pane,
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({
        cwd,
        hook_event_name: "UserPromptSubmit",
        prompt: promptText,
      }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe(promptText);
  });
});
