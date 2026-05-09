import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with a parent_id matching an existing top-level record", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("nests the subagent under the parent record on /api/state", async () => {
    const post = (body) =>
      fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    // Register the parent.
    const parentRes = await post({
      id: "P1aaaaaa",
      id_raw: "host:pane:/p",
      status: "working",
    });
    expect([200, 202]).toContain(parentRes.status);

    // Now post a subagent event referencing that parent.
    const subRes = await post({
      id: "S1bbbbbb",
      id_raw: "P1aaaaaa:tooluse-1",
      status: "active",
      parent_id: "P1aaaaaa",
    });
    expect([200, 202]).toContain(subRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();

    // Exactly one top-level record (the parent) — the subagent does not get its own slot.
    expect(records).toHaveLength(1);
    const parent = records[0];
    expect(parent.id).toBe("P1aaaaaa");
    expect(Array.isArray(parent.subagents)).toBe(true);
    expect(parent.subagents).toHaveLength(1);
    expect(parent.subagents[0].id).toBe("S1bbbbbb");
    expect(parent.subagents[0].status).toBe("active");
  });
});
