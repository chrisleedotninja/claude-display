import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with parent_id and non-idle status bumps the parent's last_event_at", () => {
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  it("advances the parent's last_event_at to a value strictly greater than before, and records the subagent in the parent's subagents array", async () => {
    // Register the parent. (Whether the registration itself sets a numeric
    // last_event_at is an orthogonal concern handled by sibling slices; this
    // test only asserts that the *bump* on subagent activity produces a
    // strictly-greater numeric timestamp.)
    await post({ id: "P3aaaaaa", id_raw: "host:pane:/p3", status: "working" });

    // Capture the parent's last_event_at (or 0 if absent) and the time
    // immediately before firing the subagent event.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const beforeRecord = records[0];
    const beforeTs = typeof beforeRecord.last_event_at === "number" ? beforeRecord.last_event_at : 0;

    // Sleep so any new clock read is strictly later than `beforeTs`.
    await sleep(5);
    const beforePostMs = Date.now();

    // Fire a subagent activity event (non-idle) referencing the parent.
    await post({
      id: "S3bbbbbb",
      id_raw: "P3aaaaaa:tooluse-3",
      status: "active",
      parent_id: "P3aaaaaa",
    });

    // Re-read; the parent's last_event_at should now be a finite positive
    // number that is strictly greater than the pre-bump value (and at least
    // as great as the local clock reading taken immediately before posting).
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(records).toHaveLength(1);
    const afterTs = records[0].last_event_at;
    expect(typeof afterTs).toBe("number");
    expect(Number.isFinite(afterTs)).toBe(true);
    expect(afterTs).toBeGreaterThan(beforeTs);
    expect(afterTs).toBeGreaterThanOrEqual(beforePostMs);

    // The subagent is recorded under the parent.
    expect(records[0].subagents).toHaveLength(1);
    expect(records[0].subagents[0].id).toBe("S3bbbbbb");
    expect(records[0].subagents[0].status).toBe("active");
  });
});
