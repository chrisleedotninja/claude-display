import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
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

/**
 * Create a shim directory containing an executable `tmux` script that prints
 * `output` regardless of arguments. Returns { dir, cleanup }.
 */
function makeTmuxShim(output) {
  const dir = mkdtempSync(join(tmpdir(), "claude-display-shim-"));
  const path = join(dir, "tmux");
  writeFileSync(path, `#!/usr/bin/env bash\nprintf '%s\\n' '${output}'\n`, "utf8");
  chmodSync(path, 0o755);
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("hook captures tmux session label", () => {
  let handle;
  let baseUrl;
  let shim;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
    if (shim) {
      shim.cleanup();
      shim = null;
    }
  });

  it("posts session_label from tmux display-message when TMUX_PANE is set", async () => {
    shim = makeTmuxShim("tmux-session-name");
    const env = {
      PATH: `${shim.dir}:${process.env.PATH}`,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/some/dir" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].session_label).toBe("tmux-session-name");
  });

  it("two distinct tmux sessions yield two records with two distinct session_labels", async () => {
    // First invocation — session "alpha".
    {
      const sh = makeTmuxShim("alpha");
      const env = {
        PATH: `${sh.dir}:${process.env.PATH}`,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      delete env.TTY;
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/dir/a" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      sh.cleanup();
    }
    // Second invocation — session "beta", different cwd & pane so the id differs.
    {
      const sh = makeTmuxShim("beta");
      const env = {
        PATH: `${sh.dir}:${process.env.PATH}`,
        HOSTNAME: "hostA",
        TMUX_PANE: "%9",
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      delete env.TTY;
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/dir/b" }),
      });
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      sh.cleanup();
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(2);
    const labels = records.map((r) => r.session_label).sort();
    expect(labels).toEqual(["alpha", "beta"]);
  });
});

describe("hook captures cmux workspace label and bare absence", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("cmux: posts session_label from CMUX_WORKSPACE_NAME when TMUX_PANE is unset", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      CMUX_WORKSPACE_NAME: "cm-ws-name",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    // No TMUX_PANE, no TTY.
    delete env.TMUX_PANE;
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/cm/dir" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].session_label).toBe("cm-ws-name");
  });

  it("bare: no session_label on the record when neither TMUX_PANE nor CMUX_* is set", async () => {
    const env = {
      // Use a deliberately empty PATH so any accidental `tmux` lookup would
      // not find a real binary either — but the hook should not even attempt
      // it in this case.
      PATH: "",
      HOSTNAME: "hostA",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    delete env.TMUX_PANE;
    delete env.TTY;
    delete env.CMUX_WORKSPACE_NAME;

    const { exitCode, stderr } = await runHook({
      env: { ...env, PATH: process.env.PATH },
      stdin: JSON.stringify({ cwd: "/bare/dir" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].session_label).toBeUndefined();
  });
});
