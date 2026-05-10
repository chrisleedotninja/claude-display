import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("/api/state shape on a plain top-level record is additive", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("preserves id/id_raw/status and exposes subagents as an empty array when none have been posted", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "topplain",
        id_raw: "host:pane:/plain",
        status: "working",
      }),
    });
    expect([200, 202]).toContain(res.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const rec = records[0];
    // Pre-existing fields unchanged.
    expect(rec.id).toBe("topplain");
    expect(rec.id_raw).toBe("host:pane:/plain");
    expect(rec.status).toBe("working");
    // Additive: subagents present as an array, empty when no subagent posted.
    expect(Array.isArray(rec.subagents)).toBe(true);
    expect(rec.subagents).toHaveLength(0);
  });
});
