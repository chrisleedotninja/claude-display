import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with a malformed parent_id", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("returns 4xx and does not mutate state when parent_id is the wrong type", async () => {
    const post = (body) =>
      fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const cases = [
      { id: "sa111111", id_raw: "host:pane:/x", status: "active", parent_id: 42 },
      { id: "sa222222", id_raw: "host:pane:/x", status: "active", parent_id: ["p"] },
      { id: "sa333333", id_raw: "host:pane:/x", status: "active", parent_id: { p: 1 } },
      { id: "sa444444", id_raw: "host:pane:/x", status: "active", parent_id: true },
    ];

    for (const body of cases) {
      const res = await post(body);
      expect(res.status, `body=${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(res.status, `body=${JSON.stringify(body)}`).toBeLessThan(500);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    // No record from any of the malformed posts may have been recorded.
    const ids = new Set(records.map((r) => r.id));
    for (const body of cases) {
      expect(ids.has(body.id), `id=${body.id} should not be present`).toBe(false);
    }
  });

  it("accepts a parent_id of type string (sanity baseline)", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sa999999",
        id_raw: "p:tooluse",
        status: "active",
        parent_id: "p1234567",
      }),
    });
    expect([200, 202]).toContain(res.status);
  });
});
