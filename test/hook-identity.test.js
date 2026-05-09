import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, "..", "hook", "heartbeat.sh");

function sha256Prefix(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
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

describe("hook posts identity", () => {
  let handle;
  let baseUrl;
  let received;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    received = [];
  });

  afterEach(() => {
    handle.stop();
  });

  it("posts the expected id, id_raw, and status for hostname:pane:cwd", async () => {
    const env = {
      PATH: process.env.PATH,
      HOSTNAME: "hostA",
      TMUX_PANE: "%5",
      CLAUDE_DISPLAY_URL: baseUrl,
    };
    // Don't inherit a real TTY into the script.
    delete env.TTY;

    const { exitCode, stderr } = await runHook({
      env,
      stdin: JSON.stringify({ cwd: "/some/dir" }),
    });
    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    const expectedRaw = "hostA:%5:/some/dir";
    const expectedId = sha256Prefix(expectedRaw);
    expect(records[0].id_raw).toBe(expectedRaw);
    expect(records[0].id).toBe(expectedId);
    expect(records[0].status).toBe("active");
  });
});
