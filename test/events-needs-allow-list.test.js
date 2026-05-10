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
});
