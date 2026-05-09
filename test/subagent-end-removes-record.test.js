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
});
