import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("multiple concurrent subagents under one parent", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const post = (body, baseUrl_) =>
    fetch(`${baseUrl_}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("surfaces both subagents on /api/state with the parent record", async () => {
    await post({ id: "P2aaaaaa", id_raw: "host:pane:/p2", status: "working" }, baseUrl);
    await post(
      { id: "S1aaaaaa", id_raw: "P2aaaaaa:tu-1", status: "active", parent_id: "P2aaaaaa" },
      baseUrl,
    );
    await post(
      { id: "S2bbbbbb", id_raw: "P2aaaaaa:tu-2", status: "active", parent_id: "P2aaaaaa" },
      baseUrl,
    );

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    const parent = records[0];
    expect(parent.id).toBe("P2aaaaaa");
    expect(parent.subagents).toHaveLength(2);
    const subIds = parent.subagents.map((s) => s.id).sort();
    expect(subIds).toEqual(["S1aaaaaa", "S2bbbbbb"]);
  });

  it("replaces an existing subagent on duplicate id rather than appending", async () => {
    await post({ id: "P3cccccc", id_raw: "host:pane:/p3", status: "working" }, baseUrl);
    await post(
      { id: "S1aaaaaa", id_raw: "P3cccccc:tu-1", status: "active", parent_id: "P3cccccc" },
      baseUrl,
    );
    await post(
      { id: "S2bbbbbb", id_raw: "P3cccccc:tu-2", status: "active", parent_id: "P3cccccc" },
      baseUrl,
    );
    // Re-post S1 with a new status; it should replace, not append.
    await post(
      { id: "S1aaaaaa", id_raw: "P3cccccc:tu-1", status: "waiting", parent_id: "P3cccccc" },
      baseUrl,
    );

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parent = records[0];
    expect(parent.subagents).toHaveLength(2);
    const byId = Object.fromEntries(parent.subagents.map((s) => [s.id, s]));
    expect(byId["S1aaaaaa"].status).toBe("waiting");
    expect(byId["S2bbbbbb"].status).toBe("active");
  });
});
