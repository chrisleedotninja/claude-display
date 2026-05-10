import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("a subagent event under the already-topmost parent leaves the view-model shape stable", () => {
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

  it("re-firing on a topmost parent's existing subagent keeps the parent topmost with subagents [S1, S2] intact and S1's status updated", async () => {
    // Register parent P with nested subagents S1 and S2 (in order).
    await post({ id: "Ptopmost", id_raw: "host:pane:/p", status: "working" });
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "Ptopmost:tooluse-1",
      status: "active",
      parent_id: "Ptopmost",
    });
    await sleep(5);
    await post({
      id: "S2bbbbbb",
      id_raw: "Ptopmost:tooluse-2",
      status: "active",
      parent_id: "Ptopmost",
    });

    // Baseline: P is topmost (only top-level record), with [S1, S2].
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    let cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("Ptopmost");
    expect(cards[0].subagents.map((s) => s.id)).toEqual(["S1aaaaaa", "S2bbbbbb"]);
    const topLevelCountBefore = records.length;

    // Fire another activity event for S1 with a status change ("queued" —
    // any non-idle status that differs from the previous "active" suffices
    // to prove the upsert wrote through).
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "Ptopmost:tooluse-1",
      status: "queued",
      parent_id: "Ptopmost",
    });

    // After: still exactly one top-level record (no orphan slot for S1);
    // P is still topmost; subagents are still [S1, S2] in that order;
    // S1's status reflects the new event; S2's status is unchanged.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    cards = cardsFromState(records);
    expect(records).toHaveLength(topLevelCountBefore);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("Ptopmost");
    expect(cards[0].subagents.map((s) => s.id)).toEqual(["S1aaaaaa", "S2bbbbbb"]);
    expect(cards[0].subagents[0].status).toBe("queued");
    expect(cards[0].subagents[1].status).toBe("active");
  });
});
