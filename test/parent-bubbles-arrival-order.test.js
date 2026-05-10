import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("two consecutive subagent events across two parents produce arrival-order topmost ranking", () => {
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

  it("after firing a subagent activity for P1, then for P2, cardsFromState lists P2 first and P1 second", async () => {
    // Register two parents, each with one nested subagent. The initial
    // attaches set distinct ascending last_event_at values per parent.
    await post({ id: "P1aaaaaa", id_raw: "host:pane:/p1", status: "working" });
    await post({ id: "P2bbbbbb", id_raw: "host:pane:/p2", status: "working" });
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "P1aaaaaa:tooluse-1",
      status: "active",
      parent_id: "P1aaaaaa",
    });
    await sleep(5);
    await post({
      id: "S2bbbbbb",
      id_raw: "P2bbbbbb:tooluse-1",
      status: "active",
      parent_id: "P2bbbbbb",
    });
    // After initial attaches, P2 is topmost (its attach was later).

    // Sleep, then fire a subagent activity event under P1's child first.
    await sleep(5);
    await post({
      id: "S1aaaaaa",
      id_raw: "P1aaaaaa:tooluse-1",
      status: "active",
      parent_id: "P1aaaaaa",
    });
    // Sleep, then fire one under P2's child.
    await sleep(5);
    await post({
      id: "S2bbbbbb",
      id_raw: "P2bbbbbb:tooluse-1",
      status: "active",
      parent_id: "P2bbbbbb",
    });

    // P2 (last to bubble) should be topmost, P1 immediately below.
    const records = await (await fetch(`${baseUrl}/api/state`)).json();
    const cards = cardsFromState(records);
    expect(cards.map((c) => c.id).slice(0, 2)).toEqual(["P2bbbbbb", "P1aaaaaa"]);
  });
});
