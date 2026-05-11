import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with a detail field", () => {
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

  it("round-trips a non-empty detail through GET /api/state and preserves it across re-POSTs", async () => {
    const detail =
      "Wants to nuke node_modules to resolve a peer-dep conflict in @stripe/react-stripe-js. Last build failed with ERESOLVE.";

    const first = await post({
      id: "det00001",
      id_raw: "host:pane:/d",
      status: "working",
      detail,
    });
    expect([200, 202]).toContain(first.status);

    let stateRes = await fetch(`${baseUrl}/api/state`);
    let records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("det00001");
    expect(records[0].detail).toBe(detail);

    // A second POST under the same id (simulating hook restart) preserves
    // the detail value verbatim — AC6 at the wire layer.
    const second = await post({
      id: "det00001",
      id_raw: "host:pane:/d",
      status: "working",
      detail,
    });
    expect([200, 202]).toContain(second.status);

    stateRes = await fetch(`${baseUrl}/api/state`);
    records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toBe(detail);
  });

  it("silently drops absent, empty, and non-string detail without 4xxing", async () => {
    // Each case posts a distinct id so all five records coexist on /api/state.
    const cases = [
      { id: "drop1abs", body: { id: "drop1abs", status: "working" } }, // omitted
      {
        id: "drop2emp",
        body: { id: "drop2emp", status: "working", detail: "" },
      },
      {
        id: "drop3num",
        body: { id: "drop3num", status: "working", detail: 42 },
      },
      {
        id: "drop4obj",
        body: { id: "drop4obj", status: "working", detail: {} },
      },
      {
        id: "drop5arr",
        body: { id: "drop5arr", status: "working", detail: ["x"] },
      },
    ];

    for (const c of cases) {
      const res = await post(c.body);
      expect([200, 202]).toContain(res.status);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(cases.length);

    for (const c of cases) {
      const rec = records.find((r) => r.id === c.id);
      expect(rec).toBeDefined();
      expect(rec.detail).toBeUndefined();
    }
  });

  it("stores a 5,000-character detail verbatim with no truncation and no 4xx", async () => {
    const detail = "x".repeat(5000);
    const res = await post({
      id: "det5kchr",
      id_raw: "host:pane:/d",
      status: "working",
      detail,
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].detail.length).toBe(5000);
    expect(records[0].detail).toBe(detail);
  });
});
