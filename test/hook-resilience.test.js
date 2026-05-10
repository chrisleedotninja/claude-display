import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, "..", "hook", "heartbeat.sh");

// Pick a port we expect to be closed. Reserved high port outside the dynamic
// range that's also unlikely to clash with the project's CLAUDE_DISPLAY_PORT
// defaults or test ports.
const CLOSED_PORT = 7;

describe("hook is resilient when the server is unreachable", () => {
  it("exits 0 within ~2s when nothing is listening on the configured URL", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%9",
      CLAUDE_DISPLAY_URL: `http://127.0.0.1:${CLOSED_PORT}`,
    };

    const start = Date.now();
    const proc = Bun.spawn([hookPath], {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write(JSON.stringify({ cwd: "/q", hook_event_name: "SessionStart" }));
    await proc.stdin.end();
    const exitCode = await proc.exited;
    const elapsed = Date.now() - start;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    // curl --max-time 1 --connect-timeout 1 caps the network wait at ~1s;
    // 2000ms gives plenty of slack for the bun spawn + shasum + JSON build.
    expect(elapsed).toBeLessThan(2000);
  });
});
