import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("end event for an unknown subagent is tolerated without state mutation", () => {
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

  it("absorbs an end event for an unknown parent without conjuring a top-level record", async () => {
    const res = await post({
      id: "Sxorphan",
      id_raw: "UNKNOWN1:tooluse-9",
      status: "idle",
      parent_id: "UNKNOWN1",
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    // Crucially: no top-level record is conjured for the orphan end event
    // (unlike activity-event orphans which DO render at top level).
    expect(records).toHaveLength(0);
  });

  it("absorbs an end event for an unknown subagent under a known parent without mutating the parent", async () => {
    // Register only the parent — no subagent attached.
    await post({ id: "P6gggggg", id_raw: "host:pane:/p6", status: "working" });

    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parentBefore = records[0];
    const parentSnapshot = {
      id: parentBefore.id,
      id_raw: parentBefore.id_raw,
      status: parentBefore.status,
      last_event_at: parentBefore.last_event_at,
      subagentCount: parentBefore.subagents.length,
    };

    // Fire an end event for a subagent the parent doesn't have.
    const res = await post({
      id: "Sunknown",
      id_raw: "P6gggggg:tu-unknown",
      status: "idle",
      parent_id: "P6gggggg",
    });
    expect([200, 202]).toContain(res.status);

    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parentAfter = records[0];
    expect({
      id: parentAfter.id,
      id_raw: parentAfter.id_raw,
      status: parentAfter.status,
      last_event_at: parentAfter.last_event_at,
      subagentCount: parentAfter.subagents.length,
    }).toEqual(parentSnapshot);
  });

  it("keeps serving /api/state cleanly after an orphan end event", async () => {
    // Fire an orphan end event.
    const res = await post({
      id: "Sxghost",
      id_raw: "UNKNOWN2:tu-9",
      status: "idle",
      parent_id: "UNKNOWN2",
    });
    expect([200, 202]).toContain(res.status);

    // GET /api/state still 200.
    const r1 = await fetch(`${baseUrl}/api/state`);
    expect(r1.status).toBe(200);

    // A subsequent activity event still works.
    const r2 = await post({ id: "Pliveafter", id_raw: "host:pane:/q", status: "working" });
    expect([200, 202]).toContain(r2.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("Pliveafter");
  });
});
