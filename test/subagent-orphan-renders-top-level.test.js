import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("orphan subagent (parent_id not in state) renders at top level", () => {
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

  it("creates a top-level record for the subagent and the server stays alive", async () => {
    const res = await post({
      id: "Sxorphan",
      id_raw: "UNKNOWN1:tooluse-9",
      status: "working",
      parent_id: "UNKNOWN1",
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    // No record was conjured for UNKNOWN1; the orphan is rendered as its own
    // top-level record.
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("Sxorphan");
    expect(records[0].status).toBe("working");

    // A second read still succeeds (server did not crash).
    const stateRes2 = await fetch(`${baseUrl}/api/state`);
    expect(stateRes2.status).toBe(200);

    // A subsequent post also succeeds.
    const postAgain = await post({
      id: "Syother",
      id_raw: "host:pane:/y",
      status: "working",
    });
    expect([200, 202]).toContain(postAgain.status);
  });
});
