import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with an instance field", () => {
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

  it("round-trips a non-empty instance string and preserves it across re-POSTs under the same id", async () => {
    const res = await post({
      id: "inst0001",
      id_raw: "host:pane:/cwd/inst0001",
      status: "active",
      instance: "cc-payments",
    });
    expect([200, 202]).toContain(res.status);

    let stateRes = await fetch(`${baseUrl}/api/state`);
    let records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("inst0001");
    expect(records[0].instance).toBe("cc-payments");

    // A second POST under the same id (the "killing and restarting the hook
    // preserves instance" half of AC6 expressed at the wire layer — the
    // second POST simulates the restart) leaves the record's instance value
    // still set verbatim.
    const res2 = await post({
      id: "inst0001",
      id_raw: "host:pane:/cwd/inst0001",
      status: "active",
      instance: "cc-payments",
    });
    expect([200, 202]).toContain(res2.status);

    stateRes = await fetch(`${baseUrl}/api/state`);
    records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].instance).toBe("cc-payments");
  });

  it("silently drops absent, empty-string, and non-string instance values without 4xx", async () => {
    // Each case POSTs a different shape under a fresh id. Every case must
    // produce a 2xx and a record with no `instance` key — never a 4xx over
    // this field. Mirrors the desktop / session_label silent-drop posture
    // (NOT the repo / branch validation posture, which 4xxes on wrong type).
    const cases = [
      { id: "drop0001", instance: "" },
      { id: "drop0002" /* instance key omitted entirely */ },
      { id: "drop0003", instance: 42 },
      { id: "drop0004", instance: {} },
      { id: "drop0005", instance: ["x"] },
    ];

    for (const c of cases) {
      const body = {
        id: c.id,
        id_raw: `host:pane:/cwd/${c.id}`,
        status: "active",
      };
      if (Object.hasOwn(c, "instance")) body.instance = c.instance;
      const res = await post(body);
      expect([200, 202]).toContain(res.status);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(cases.length);

    for (const c of cases) {
      const rec = records.find((r) => r.id === c.id);
      expect(rec).toBeDefined();
      // Absence is precise: no `instance` key on the record at all.
      expect(Object.hasOwn(rec, "instance")).toBe(false);
    }
  });
});
