import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events carries repo and branch through to /api/state", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("round-trips repo and branch on the stored record when posted", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "abc12345",
        id_raw: "host:pane:/cwd",
        status: "active",
        repo: "claude-display",
        branch: "main",
      }),
    });
    expect(postRes.status).toBe(202);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("abc12345");
    expect(records[0].repo).toBe("claude-display");
    expect(records[0].branch).toBe("main");
  });

  it("still accepts a body without repo and branch (backward compatible) and returns 202", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "def67890",
        id_raw: "host:pane:/cwd",
        status: "active",
      }),
    });
    expect(postRes.status).toBe(202);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    // Either absent or empty string — but never a placeholder.
    const r = records[0];
    expect(r.repo === undefined || r.repo === "").toBe(true);
    expect(r.branch === undefined || r.branch === "").toBe(true);
    expect(r.repo).not.toBe("unknown");
    expect(r.branch).not.toBe("unknown");
  });

  it("rejects non-string repo or branch with 400", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "abc12345",
        id_raw: "host:pane:/cwd",
        status: "active",
        repo: 42,
      }),
    });
    expect(res.status).toBe(400);
  });
});
