import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events `needs` field — frozen seven-value allow-list", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("round-trips a valid needs value verbatim through /api/state", async () => {
    // Exercise three distinct allow-list values across three distinct sessions
    // so the read endpoint reflects the membership check, not a single
    // hardcoded string. The ids differ so each session's record stands alone.
    const cases = [
      { id: "needs0001", needs: "approve-tool" },
      { id: "needs0002", needs: "answer-question" },
      { id: "needs0003", needs: "review-diff" },
    ];

    for (const c of cases) {
      const postRes = await fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: c.id,
          id_raw: `host:pane:/cwd/${c.id}`,
          status: "approval",
          needs: c.needs,
        }),
      });
      expect([200, 202]).toContain(postRes.status);
    }

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(cases.length);

    for (const c of cases) {
      const rec = records.find((r) => r.id === c.id);
      expect(rec).toBeDefined();
      expect(rec.needs).toBe(c.needs);
    }
  });

  it("produces a record with no `needs` key when the field is absent", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "noneeds1",
        id_raw: "host:pane:/cwd/noneeds1",
        status: "working",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const rec = records[0];

    // The rest of the payload still round-trips.
    expect(rec.id).toBe("noneeds1");
    expect(rec.id_raw).toBe("host:pane:/cwd/noneeds1");
    expect(rec.status).toBe("working");

    // Absence is precise: no `needs` key on the record at all (not `null`,
    // not explicitly `undefined`). `Object.hasOwn` is the right check —
    // `rec.needs === undefined` would also pass for an explicitly-set
    // `undefined`, which is not what the spec means by "no needs key".
    expect(Object.hasOwn(rec, "needs")).toBe(false);
  });
});
