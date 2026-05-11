import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with a title field", () => {
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

  it("round-trips a non-empty title string and preserves it across re-POSTs under the same id", async () => {
    const res = await post({
      id: "ttl00001",
      id_raw: "host:pane:/cwd/ttl00001",
      status: "active",
      title: "Reviewing PR #42",
    });
    expect([200, 202]).toContain(res.status);

    let stateRes = await fetch(`${baseUrl}/api/state`);
    let records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("ttl00001");
    expect(records[0].title).toBe("Reviewing PR #42");

    // A second POST under the same id (the "the title field is preserved
    // across consecutive fires" half of AC2 expressed at the wire layer —
    // the second POST simulates the next heartbeat in the same session)
    // leaves the record's title value still set verbatim.
    const res2 = await post({
      id: "ttl00001",
      id_raw: "host:pane:/cwd/ttl00001",
      status: "active",
      title: "Reviewing PR #42",
    });
    expect([200, 202]).toContain(res2.status);

    stateRes = await fetch(`${baseUrl}/api/state`);
    records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("Reviewing PR #42");
  });

  it("silently drops absent, empty-string, and non-string title values without 4xx", async () => {
    // Each case POSTs a different shape under a fresh id. Every case must
    // produce a 2xx and a record with no `title` key — never a 4xx over
    // this field. Mirrors the desktop / session_label silent-drop posture
    // (NOT the repo / branch validation posture, which 4xxes on wrong type).
    const cases = [
      { id: "drop_t01", title: "" },
      { id: "drop_t02" /* title key omitted entirely */ },
      { id: "drop_t03", title: 42 },
      { id: "drop_t04", title: {} },
      { id: "drop_t05", title: ["x"] },
    ];

    for (const c of cases) {
      const body = {
        id: c.id,
        id_raw: `host:pane:/cwd/${c.id}`,
        status: "active",
      };
      if (Object.hasOwn(c, "title")) body.title = c.title;
      const res = await post(body);
      expect([200, 202]).toContain(res.status);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(cases.length);

    for (const c of cases) {
      const rec = records.find((r) => r.id === c.id);
      expect(rec).toBeDefined();
      // Absence is precise: no `title` key on the record at all.
      expect(Object.hasOwn(rec, "title")).toBe(false);
    }
  });
});
