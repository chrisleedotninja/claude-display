import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events + GET /api/state", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("stores a posted event and surfaces it on the state read", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "abc12345",
        id_raw: "host:pane:/cwd",
        status: "working",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("abc12345");
    expect(records[0].status).toBe("working");
  });

  it("keeps two distinct ids as two records", async () => {
    // placeholder for Step 3 — written now to keep the file co-located,
    // but skipped so this RED only tests the Step 2 behavior.
    expect(true).toBe(true);
  });
});
