import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

// Build a PATH composed of system entries that do NOT contain an `aerospace`
// binary. Used by the "no aerospace on PATH" test to simulate aerospace being
// absent without losing access to bash, curl, shasum, etc.
function pathWithoutAerospace() {
  const entries = (process.env.PATH || "").split(":").filter(Boolean);
  return entries.filter((dir) => !existsSync(join(dir, "aerospace"))).join(":");
}

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, "..", "hook", "heartbeat.sh");

function writeShim(dir, name, body) {
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
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

describe("hook posts desktop", () => {
  let handle;
  let baseUrl;
  let shimDir;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    shimDir = mkdtempSync(join(tmpdir(), "claude-display-shim-"));
  });

  afterEach(() => {
    handle.stop();
    rmSync(shimDir, { recursive: true, force: true });
  });

  describe("aerospace on PATH", () => {
    it("captures the focused workspace label and posts it as desktop", async () => {
      writeShim(
        shimDir,
        "aerospace",
        `#!/usr/bin/env bash\nif [[ "$1" == "list-workspaces" && "$2" == "--focused" ]]; then echo "code"; fi\n`,
      );

      const env = {
        PATH: `${shimDir}:${process.env.PATH}`,
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
      expect(records[0].desktop).toBe("code");
    });
  });

  describe("no aerospace on PATH", () => {
    it("posts an absent desktop and never a placeholder string", async () => {
      // PATH composed only of system dirs that do NOT contain an aerospace
      // binary. Keeps bash/curl/shasum available so the rest of the hook runs.
      const env = {
        PATH: pathWithoutAerospace(),
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
      const desktop = records[0].desktop;
      // Absent or empty — but never a sentinel placeholder.
      expect(desktop === undefined || desktop === "").toBe(true);
      expect(["unknown", "-", "n/a", "none"]).not.toContain(desktop);
    });
  });

  describe("slow or erroring aerospace", () => {
    it("kills a slow aerospace within budget and posts no desktop", async () => {
      writeShim(shimDir, "aerospace", `#!/usr/bin/env bash\nsleep 5\n`);

      const env = {
        PATH: `${shimDir}:${process.env.PATH}`,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: baseUrl,
      };

      const start = Date.now();
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
      });
      const elapsed = Date.now() - start;
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(elapsed).toBeLessThan(2000);

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const records = await stateRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].desktop).toBeUndefined();
    });

    it("treats an erroring aerospace as no value and still exits 0", async () => {
      writeShim(
        shimDir,
        "aerospace",
        `#!/usr/bin/env bash\necho "boom" >&2\nexit 2\n`,
      );

      const env = {
        PATH: `${shimDir}:${process.env.PATH}`,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: baseUrl,
      };

      const start = Date.now();
      const { exitCode, stderr } = await runHook({
        env,
        stdin: JSON.stringify({ cwd: "/some/dir", hook_event_name: "SessionStart" }),
      });
      const elapsed = Date.now() - start;
      expect(exitCode, `stderr: ${stderr}`).toBe(0);
      expect(elapsed).toBeLessThan(2000);

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const records = await stateRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].desktop).toBeUndefined();
    });
  });

  describe("freshness across invocations", () => {
    it("reflects the current focused workspace on each fire", async () => {
      const env = {
        PATH: `${shimDir}:${process.env.PATH}`,
        HOSTNAME: "hostA",
        TMUX_PANE: "%5",
        CLAUDE_DISPLAY_URL: baseUrl,
      };
      const stdin = JSON.stringify({ cwd: "/p", hook_event_name: "SessionStart" });

      writeShim(shimDir, "aerospace", `#!/usr/bin/env bash\necho "1"\n`);
      const first = await runHook({ env, stdin });
      expect(first.exitCode, `stderr: ${first.stderr}`).toBe(0);
      let stateRes = await fetch(`${baseUrl}/api/state`);
      let records = await stateRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].desktop).toBe("1");

      writeShim(shimDir, "aerospace", `#!/usr/bin/env bash\necho "2"\n`);
      const second = await runHook({ env, stdin });
      expect(second.exitCode, `stderr: ${second.stderr}`).toBe(0);
      stateRes = await fetch(`${baseUrl}/api/state`);
      records = await stateRes.json();
      expect(records).toHaveLength(1);
      expect(records[0].desktop).toBe("2");
    });
  });
});
