import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("a subagent activity event makes the parent topmost in the dashboard view-model", () => {
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

  // Helper: register parents A, B, C in order, then attach a subagent under
  // each from oldest to newest so each parent's `last_event_at` is distinct
  // and ascending in registration order — A oldest, C newest. Subagents
  // S_B and S_C are nested under B and C respectively; A gets two subagents
  // S1, S2 (in that order) so steps 2/3 can also assert nested order.
  // Returns nothing — call site reads /api/state afterwards.
  async function setupABCWithSubagents() {
    await post({ id: "Aaaaaaaa", id_raw: "host:pane:/a", status: "working" });
    await post({ id: "Bbbbbbbb", id_raw: "host:pane:/b", status: "working" });
    await post({ id: "Cccccccc", id_raw: "host:pane:/c", status: "working" });
    // Touch A first — earliest last_event_at among the three parents.
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "Aaaaaaaa:tooluse-1",
      status: "active",
      parent_id: "Aaaaaaaa",
    });
    // Then S2 under A, still earlier than B/C.
    await sleep(5);
    await post({
      id: "S2aaaaaa",
      id_raw: "Aaaaaaaa:tooluse-2",
      status: "active",
      parent_id: "Aaaaaaaa",
    });
    // Then a subagent under B — B's last_event_at now exceeds A's.
    await sleep(5);
    await post({
      id: "SBbbbbbb",
      id_raw: "Bbbbbbbb:tooluse",
      status: "active",
      parent_id: "Bbbbbbbb",
    });
    // Finally a subagent under C — C's last_event_at exceeds B's and A's.
    await sleep(5);
    await post({
      id: "SCcccccc",
      id_raw: "Cccccccc:tooluse",
      status: "active",
      parent_id: "Cccccccc",
    });
  }

  it("after a subagent activity event under the oldest parent, that parent flips to topmost in cardsFromState", async () => {
    await setupABCWithSubagents();

    // Baseline: [C, B, A] in cardsFromState (each parent's last_event_at was
    // set in ascending order via its own subagent attach).
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    let cards = cardsFromState(records);
    expect(cards.map((c) => c.id)).toEqual(["Cccccccc", "Bbbbbbbb", "Aaaaaaaa"]);

    // Fire a subagent activity event under A (S1 status update).
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "Aaaaaaaa:tooluse-1",
      status: "active",
      parent_id: "Aaaaaaaa",
    });

    // After: A is topmost, then C, then B.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    cards = cardsFromState(records);
    expect(cards.map((c) => c.id)).toEqual(["Aaaaaaaa", "Cccccccc", "Bbbbbbbb"]);
  });

  it("the bubbled parent's nested subagents stay attached and in their original [S1, S2] order", async () => {
    await setupABCWithSubagents();

    // Baseline: A has [S1, S2] nested.
    let records = await (await fetch(`${baseUrl}/api/state`)).json();
    let cards = cardsFromState(records);
    const aBaseline = cards.find((c) => c.id === "Aaaaaaaa");
    expect(aBaseline.subagents.map((s) => s.id)).toEqual(["S1aaaaaa", "S2aaaaaa"]);

    // Fire a subagent activity event under A (S1 status update).
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "Aaaaaaaa:tooluse-1",
      status: "active",
      parent_id: "Aaaaaaaa",
    });

    // After: A is topmost, and its subagents are still [S1, S2] in order.
    records = await (await fetch(`${baseUrl}/api/state`)).json();
    cards = cardsFromState(records);
    expect(cards[0].id).toBe("Aaaaaaaa");
    expect(cards[0].subagents.map((s) => s.id)).toEqual(["S1aaaaaa", "S2aaaaaa"]);
    // And both subagents still carry their statuses (S1 = "active",
    // S2 = "active" — neither has been dropped or replaced with an empty
    // shape).
    expect(cards[0].subagents[0].status).toBe("active");
    expect(cards[0].subagents[1].status).toBe("active");
  });
});
