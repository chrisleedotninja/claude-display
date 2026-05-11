import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Tests for the subagent-nesting branch of /events: when `parent_id` is a
// known parent, the resulting subagent record must carry `needs` only when
// the wire payload supplies a value from the seven-value enum. Mirrors the
// top-level `needs` allow-list posture from chore [034]
// (test/events-needs-allow-list.test.js) plus the parent-then-subagent
// two-POST shape from test/subagent-event-payload-validation.test.js.

describe("POST /events subagent-nesting branch — `needs` allow-list and silent-drop", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  async function post(body) {
    return await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function registerParent(parentId) {
    const r = await post({
      id: parentId,
      id_raw: `host:pane:/cwd/${parentId}`,
      status: "working",
    });
    expect([200, 202]).toContain(r.status);
  }

  it("stores a valid needs on a nested subagent record verbatim", async () => {
    const parentId = "p0001111";
    await registerParent(parentId);

    const subId = "s0001111";
    const r = await post({
      id: subId,
      id_raw: `${parentId}:tool-use-A`,
      parent_id: parentId,
      status: "approval",
      needs: "approve-tool",
    });
    expect([200, 202]).toContain(r.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.needs).toBe("approve-tool");
  });

  it("silently drops an unknown-string needs value on the subagent path with a 2xx", async () => {
    const parentId = "p0002222";
    await registerParent(parentId);

    const subId = "s0002222";
    const r = await post({
      id: subId,
      id_raw: `${parentId}:tool-use-B`,
      parent_id: parentId,
      status: "approval",
      needs: "bogus",
    });
    expect([200, 202]).toContain(r.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    const sub = parent.subagents.find((s) => s.id === subId);
    expect(sub).toBeDefined();
    expect(Object.hasOwn(sub, "needs")).toBe(false);
  });

  it("silently drops wrong-type needs values on the subagent path with a 2xx", async () => {
    const cases = [
      { sub: "s0003301", needs: 42 },
      { sub: "s0003302", needs: {} },
      { sub: "s0003303", needs: ["approve-tool"] },
    ];
    const parentId = "p0003333";
    await registerParent(parentId);

    for (const c of cases) {
      const r = await post({
        id: c.sub,
        id_raw: `${parentId}:tool-use-${c.sub}`,
        parent_id: parentId,
        status: "approval",
        needs: c.needs,
      });
      expect([200, 202]).toContain(r.status);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(cases.length);
    for (const c of cases) {
      const sub = parent.subagents.find((s) => s.id === c.sub);
      expect(sub).toBeDefined();
      expect(Object.hasOwn(sub, "needs")).toBe(false);
    }
  });

  it("silently drops an absent needs value on the subagent path with a 2xx", async () => {
    const parentId = "p0004444";
    await registerParent(parentId);

    const subId = "s0004444";
    const r = await post({
      id: subId,
      id_raw: `${parentId}:tool-use-C`,
      parent_id: parentId,
      status: "approval",
    });
    expect([200, 202]).toContain(r.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    const sub = parent.subagents.find((s) => s.id === subId);
    expect(sub).toBeDefined();
    expect(Object.hasOwn(sub, "needs")).toBe(false);
  });
});
