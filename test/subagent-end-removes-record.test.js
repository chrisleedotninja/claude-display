import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with status=idle and parent_id removes a known subagent", () => {
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

  it("removes the subagent record from the parent on /api/state", async () => {
    // Register the parent.
    await post({ id: "P1aaaaaa", id_raw: "host:pane:/p", status: "working" });

    // Register a subagent under it.
    await post({
      id: "S1bbbbbb",
      id_raw: "P1aaaaaa:tooluse-1",
      status: "active",
      parent_id: "P1aaaaaa",
    });

    // Sanity baseline — subagent is present.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe("S1bbbbbb");

    // Fire the end event for that subagent.
    const endRes = await post({
      id: "S1bbbbbb",
      id_raw: "P1aaaaaa:tooluse-1",
      status: "idle",
      parent_id: "P1aaaaaa",
    });
    expect([200, 202]).toContain(endRes.status);

    // The parent's subagents array no longer contains that subagent.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("P1aaaaaa");
    expect(records[0].subagents).toHaveLength(0);
  });

  it("leaves the parent's own scalar fields and last_event_at unchanged", async () => {
    // Register the parent.
    await post({ id: "P4dddddd", id_raw: "host:pane:/p4", status: "working" });

    // Capture the parent's scalar fields and last_event_at after registration.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parentBefore = records[0];
    const parentSnapshot = {
      id: parentBefore.id,
      id_raw: parentBefore.id_raw,
      status: parentBefore.status,
      last_event_at: parentBefore.last_event_at,
    };

    // Register a subagent under the parent. (This may or may not advance
    // last_event_at on the parent; the assertion below is across the
    // *end-event* delta, so capture the post-attach snapshot for comparison.)
    await post({
      id: "S4eeeeee",
      id_raw: "P4dddddd:tooluse-4",
      status: "active",
      parent_id: "P4dddddd",
    });

    records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parentAfterAttach = records[0];
    const snapshotAfterAttach = {
      id: parentAfterAttach.id,
      id_raw: parentAfterAttach.id_raw,
      status: parentAfterAttach.status,
      last_event_at: parentAfterAttach.last_event_at,
    };

    // Sanity baseline: parent scalar fields are still the registration values
    // (the subagent attach should not have rewritten the parent's scalars).
    expect(snapshotAfterAttach).toEqual(parentSnapshot);

    // Fire the end event for the subagent.
    await post({
      id: "S4eeeeee",
      id_raw: "P4dddddd:tooluse-4",
      status: "idle",
      parent_id: "P4dddddd",
    });

    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parentAfter = records[0];
    expect({
      id: parentAfter.id,
      id_raw: parentAfter.id_raw,
      status: parentAfter.status,
      last_event_at: parentAfter.last_event_at,
    }).toEqual(snapshotAfterAttach);
    // And of course the subagent is gone.
    expect(parentAfter.subagents).toHaveLength(0);
  });

  it("removes only the named subagent when multiple are recorded under the parent", async () => {
    // Register the parent.
    await post({ id: "P5ffffff", id_raw: "host:pane:/p5", status: "working" });

    // Register two subagents under it.
    await post({
      id: "Saaaaaaa",
      id_raw: "P5ffffff:tu-a",
      status: "active",
      parent_id: "P5ffffff",
    });
    await post({
      id: "Sbbbbbbb",
      id_raw: "P5ffffff:tu-b",
      status: "active",
      parent_id: "P5ffffff",
    });

    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records[0].subagents).toHaveLength(2);

    // Fire the end event for only one of them.
    const endRes = await post({
      id: "Saaaaaaa",
      id_raw: "P5ffffff:tu-a",
      status: "idle",
      parent_id: "P5ffffff",
    });
    expect([200, 202]).toContain(endRes.status);

    // The other subagent is still there; only the named one was removed.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("P5ffffff");
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe("Sbbbbbbb");
    expect(records[0].subagents[0].status).toBe("active");
  });
});
