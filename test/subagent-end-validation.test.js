import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("malformed end-event payloads return 4xx without mutating state", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const post = (body) =>
    fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns 4xx for end-shaped payloads with parent_id of the wrong type", async () => {
    // Pre-register a parent + subagent so we can also assert no mutation
    // happened to existing state.
    await post({ id: "P7hhhhhh", id_raw: "host:pane:/p7", status: "working" });
    await post({
      id: "Skeepme1",
      id_raw: "P7hhhhhh:tu-keep",
      status: "active",
      parent_id: "P7hhhhhh",
    });

    const cases = [
      { id: "Skeepme1", id_raw: "P7hhhhhh:tu-keep", status: "idle", parent_id: 42 },
      { id: "Skeepme1", id_raw: "P7hhhhhh:tu-keep", status: "idle", parent_id: ["P7hhhhhh"] },
      { id: "Skeepme1", id_raw: "P7hhhhhh:tu-keep", status: "idle", parent_id: { p: 1 } },
      { id: "Skeepme1", id_raw: "P7hhhhhh:tu-keep", status: "idle", parent_id: true },
    ];

    for (const body of cases) {
      const res = await post(body);
      expect(res.status, `body=${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(res.status, `body=${JSON.stringify(body)}`).toBeLessThan(500);
    }

    // The pre-existing subagent record is still there — none of the malformed
    // posts mutated state.
    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("P7hhhhhh");
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe("Skeepme1");
  });

  it("returns 4xx for an end-shaped payload missing the id field", async () => {
    await post({ id: "P8iiiiii", id_raw: "host:pane:/p8", status: "working" });
    await post({
      id: "Skeepme2",
      id_raw: "P8iiiiii:tu-keep",
      status: "active",
      parent_id: "P8iiiiii",
    });

    // No `id` field at all.
    const res = await post({
      id_raw: "P8iiiiii:tu-keep",
      status: "idle",
      parent_id: "P8iiiiii",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // Pre-existing subagent untouched.
    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe("Skeepme2");
  });

  it("accepts a well-formed end event (sanity baseline)", async () => {
    // Pre-register so the well-formed end has something to remove.
    await post({ id: "P9jjjjjj", id_raw: "host:pane:/p9", status: "working" });
    await post({
      id: "Sgone1",
      id_raw: "P9jjjjjj:tu-1",
      status: "active",
      parent_id: "P9jjjjjj",
    });

    const res = await post({
      id: "Sgone1",
      id_raw: "P9jjjjjj:tu-1",
      status: "idle",
      parent_id: "P9jjjjjj",
    });
    expect([200, 202]).toContain(res.status);

    // And it actually removed.
    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records[0].subagents).toHaveLength(0);
  });
});
