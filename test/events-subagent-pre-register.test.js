import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Reuses the SSE frame-reading helper pattern from
// test/events-stream-broadcast.test.js. Reads up to `count` parsed JSON
// payloads from `data:` lines, rejecting on timeout (defensive against a
// hung stream).
async function readFrames(res, count, timeoutMs = 2000) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const frames = [];
  const deadline = Date.now() + timeoutMs;
  while (frames.length < count) {
    const remain = deadline - Date.now();
    if (remain <= 0) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new Error(
        `readFrames: timed out after ${timeoutMs}ms with ${frames.length}/${count} frames`,
      );
    }
    const readP = reader.read();
    const timeoutP = new Promise((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), remain),
    );
    const result = await Promise.race([readP, timeoutP]);
    if (result.__timeout) continue;
    if (result.done) break;
    buf += decoder.decode(result.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length > 0) {
        frames.push(JSON.parse(dataLines.join("\n")));
        if (frames.length >= count) break;
      }
    }
  }
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  return frames;
}

// Tests for the pre-registration branch of POST /events. The hook may
// announce a subagent before it has any activity to report by sending
// `{id, id_raw, parent_id, instance, kind: "pre-register"}`. The server
// creates a subagent record under the parent (or under a freshly-minted
// orphan placeholder per ADR 0002) and stores `instance` verbatim, so
// that the eventual first activity event for that subagent — which does
// NOT re-send `instance` — can be merged onto the existing record without
// losing the announced field. See chore [068] / sibling [067].

describe("POST /events pre-register branch", () => {
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

  it("creates a subagent record under a known parent with instance set verbatim", async () => {
    const parentId = "pre00001";
    await registerParent(parentId);

    const subId = "sub00001";
    const r = await post({
      kind: "pre-register",
      id: subId,
      id_raw: `${parentId}:tool-use-A`,
      parent_id: parentId,
      instance: "audit-deps",
    });
    expect(r.status).toBe(202);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.id_raw).toBe(`${parentId}:tool-use-A`);
    expect(sub.instance).toBe("audit-deps");
  });

  it("merges instance forward when the subagent's first activity event arrives without one", async () => {
    const parentId = "pre00002";
    await registerParent(parentId);

    const subId = "sub00002";
    let r = await post({
      kind: "pre-register",
      id: subId,
      id_raw: `${parentId}:tool-use-B`,
      parent_id: parentId,
      instance: "audit-deps",
    });
    expect(r.status).toBe(202);

    // First activity event. No `instance`, no `kind`. The prior subagent
    // record's `instance` must survive the merge while `status` and
    // `last_event_at` overlay the announced fields.
    r = await post({
      id: subId,
      id_raw: `${parentId}:tool-use-B`,
      parent_id: parentId,
      status: "working",
    });
    expect([200, 202]).toContain(r.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.status).toBe("working");
    expect(sub.instance).toBe("audit-deps");
  });

  it("creates an orphan parent placeholder for an unknown parent_id (ADR 0002)", async () => {
    // No prior registration of parentId — the pre-register branch must mint
    // a top-level placeholder under that id rather than dropping the event.
    const parentId = "orph0001";
    const subId = "sub00003";

    const r = await post({
      kind: "pre-register",
      id: subId,
      id_raw: `${parentId}:tool-use-C`,
      parent_id: parentId,
      instance: "audit-deps",
    });
    expect(r.status).toBe(202);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.id_raw).toBe(`${parentId}:tool-use-C`);
    expect(sub.instance).toBe("audit-deps");
  });

  it("silently drops empty-string and non-string instance values on pre-register", async () => {
    // Each case POSTs a different shape under a fresh subagent id (and fresh
    // parent so the records are easy to find). Every case must produce 202
    // and a subagent record with no `instance` key. Mirrors the top-level
    // events-instance silent-drop posture (chore [034]).
    const parentId = "pre00004";
    await registerParent(parentId);

    const cases = [
      { sub: "sub00410", instance: "" },
      { sub: "sub00420", instance: 42 },
      { sub: "sub00430", instance: {} },
      { sub: "sub00440", instance: ["x"] },
    ];

    for (const c of cases) {
      const r = await post({
        kind: "pre-register",
        id: c.sub,
        id_raw: `${parentId}:${c.sub}`,
        parent_id: parentId,
        instance: c.instance,
      });
      expect(r.status).toBe(202);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents).toHaveLength(cases.length);
    for (const c of cases) {
      const sub = parent.subagents.find((s) => s.id === c.sub);
      expect(sub).toBeDefined();
      expect(Object.hasOwn(sub, "instance")).toBe(false);
    }
  });

  it("rejects missing required fields on pre-register with 4xx and no state mutation", async () => {
    // Each case omits or mis-types one of the required fields. Every case
    // must 4xx and `/api/state` must show no records at all afterward — the
    // pre-register discriminator does not bypass `id` / `parent_id`
    // validation, only the `status` requirement that the activity branch
    // enforces.
    const cases = [
      // Missing id.
      { kind: "pre-register", parent_id: "p0005550", instance: "audit-deps" },
      // Empty-string id.
      { kind: "pre-register", id: "", parent_id: "p0005551", instance: "audit-deps" },
      // Non-string id.
      { kind: "pre-register", id: 42, parent_id: "p0005552", instance: "audit-deps" },
      // Missing parent_id.
      { kind: "pre-register", id: "sub00550", instance: "audit-deps" },
      // Empty-string parent_id.
      { kind: "pre-register", id: "sub00551", parent_id: "", instance: "audit-deps" },
      // Non-string parent_id.
      { kind: "pre-register", id: "sub00552", parent_id: {}, instance: "audit-deps" },
    ];

    for (const body of cases) {
      const r = await post(body);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(0);
  });

  it("SubagentStop removes a pre-registered subagent and leaves the parent record intact", async () => {
    const parentId = "pre00006";
    await registerParent(parentId);

    const subId = "sub00006";
    let r = await post({
      kind: "pre-register",
      id: subId,
      id_raw: `${parentId}:tool-use-D`,
      parent_id: parentId,
      instance: "audit-deps",
    });
    expect(r.status).toBe(202);

    // Sanity: the subagent is present before SubagentStop.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    let parent = records.find((p) => p.id === parentId);
    expect(parent.subagents.find((s) => s.id === subId)).toBeDefined();

    // SubagentStop shape: parent_id + status: "idle".
    r = await post({
      id: subId,
      id_raw: `${parentId}:tool-use-D`,
      parent_id: parentId,
      status: "idle",
    });
    expect(r.status).toBe(202);

    records = await (await fetch(`${baseUrl}/api/state`)).json();
    parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.subagents.find((s) => s.id === subId)).toBeUndefined();
  });

  it("exposes instance on SSE and api state after a subsequent parent post", async () => {
    const parentId = "pre00007";
    await registerParent(parentId);

    const subId = "sub00007";
    let r = await post({
      kind: "pre-register",
      id: subId,
      id_raw: `${parentId}:tool-use-E`,
      parent_id: parentId,
      instance: "audit-deps",
    });
    expect(r.status).toBe(202);

    // Connect SSE subscriber AFTER the parent / pre-registration are set up
    // so the next post is the only frame the subscriber sees.
    const subRes = await fetch(`${baseUrl}/events/stream`);
    expect(subRes.status).toBe(200);
    // Small delay so the controller is registered before POST.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Subsequent top-level POST that updates the parent record. This is the
    // SSE-broadcasting path (the subagent-activity and pre-register
    // branches do not broadcast).
    r = await post({
      id: parentId,
      id_raw: `host:pane:/cwd/${parentId}`,
      status: "reviewing",
    });
    expect([200, 202]).toContain(r.status);

    const [frame] = await readFrames(subRes, 1);
    // The broadcast frame is the parent's own record; subagents are stored
    // as a Map and JSON.stringify renders Map as {}, so this assertion is
    // intentionally narrow (parent id + status). The /api/state half below
    // is the channel chore [068] AC6 cares about — it materialises the
    // Map as an array and exposes `instance` on each entry.
    expect(frame.id).toBe(parentId);
    expect(frame.status).toBe("reviewing");

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const parent = records.find((p) => p.id === parentId);
    expect(parent).toBeDefined();
    expect(parent.status).toBe("reviewing");
    expect(parent.subagents).toHaveLength(1);
    const sub = parent.subagents[0];
    expect(sub.id).toBe(subId);
    expect(sub.instance).toBe("audit-deps");
  });
});
