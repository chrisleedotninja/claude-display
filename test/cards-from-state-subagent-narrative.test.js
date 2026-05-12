import { describe, it, expect } from "bun:test";
import { cardsFromState, fmtRelative, formatElapsed } from "../app.js";

// Chore [079] Step 1: extend the `cardsFromState` subagent-mapping branch to
// conditionally project `title`, `detail`, `elapsed`, and `relative_time`
// onto each projected sub when the underlying record carries the corresponding
// wire field. Mirrors the existing parent-card narrative projection
// (chores [076] for title/detail and [072] for relative_time) so the
// `SubagentCard` renderer can apply the same structural-omit pattern that
// `Card` already uses.

describe("cardsFromState subagent narrative projection", () => {
  const T0 = 1_700_000_000_000;

  it("projects title and detail onto the subagent view-model when present", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [
          {
            id: "S",
            status: "approval",
            instance: "audit-deps",
            title: "Approve npm install",
            detail: "Permission requested",
            last_event_at: T0,
          },
        ],
      },
    ];
    const cards = cardsFromState(records, T0 + 30_000);
    expect(cards).toHaveLength(1);
    expect(cards[0].subagents).toHaveLength(1);
    const sub = cards[0].subagents[0];
    expect(sub.title).toBe("Approve npm install");
    expect(sub.detail).toBe("Permission requested");
  });

  it("projects elapsed via formatElapsed when last_event_at is a positive finite number ≤ now", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active", last_event_at: T0 }],
      },
    ];
    const cards = cardsFromState(records, T0 + 3 * 60_000);
    expect(cards[0].subagents[0].elapsed).toBe(formatElapsed(3 * 60_000));
    expect(cards[0].subagents[0].elapsed).toBe("3m");
  });

  it("projects relative_time via fmtRelative(last_event_at, now)", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active", last_event_at: T0 }],
      },
    ];
    const cards = cardsFromState(records, T0 + 2 * 60_000);
    expect(cards[0].subagents[0].relative_time).toBe(
      fmtRelative(T0, T0 + 2 * 60_000),
    );
    expect(cards[0].subagents[0].relative_time).toBe("2m ago");
  });

  it("prefers s.event_at over s.last_event_at when both are present (forward-compat fallback)", () => {
    const recA = T0;
    const recB = T0 - 10 * 60_000;
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [
          { id: "S", status: "active", event_at: recA, last_event_at: recB },
        ],
      },
    ];
    const cards = cardsFromState(records, T0 + 60_000);
    // event_at is preferred, so elapsed is computed against recA (1 minute),
    // not recB (~11 minutes).
    expect(cards[0].subagents[0].elapsed).toBe(formatElapsed(60_000));
    expect(cards[0].subagents[0].relative_time).toBe(
      fmtRelative(recA, T0 + 60_000),
    );
  });

  it("omits title on the subagent view-model when absent", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect("title" in cards[0].subagents[0]).toBe(false);
  });

  it("omits title when s.title is the empty string", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active", title: "" }],
      },
    ];
    const cards = cardsFromState(records);
    expect("title" in cards[0].subagents[0]).toBe(false);
  });

  it("omits detail on the subagent view-model when absent", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect("detail" in cards[0].subagents[0]).toBe(false);
  });

  it("omits detail when s.detail is the empty string", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active", detail: "" }],
      },
    ];
    const cards = cardsFromState(records);
    expect("detail" in cards[0].subagents[0]).toBe(false);
  });

  it("omits elapsed and relative_time when both event_at and last_event_at are absent", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect("elapsed" in cards[0].subagents[0]).toBe(false);
    expect("relative_time" in cards[0].subagents[0]).toBe(false);
  });

  it("omits elapsed and relative_time when last_event_at is non-finite", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [
          { id: "S", status: "active", last_event_at: Number.NaN },
        ],
      },
    ];
    const cards = cardsFromState(records, T0);
    expect("elapsed" in cards[0].subagents[0]).toBe(false);
    expect("relative_time" in cards[0].subagents[0]).toBe(false);
  });

  it("omits elapsed and relative_time when last_event_at is in the future (delta < 0)", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active", last_event_at: T0 + 60_000 }],
      },
    ];
    const cards = cardsFromState(records, T0);
    expect("elapsed" in cards[0].subagents[0]).toBe(false);
    expect("relative_time" in cards[0].subagents[0]).toBe(false);
  });

  it("does not mutate its input across the subagent narrative projection", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [
          {
            id: "S1",
            status: "approval",
            instance: "audit-deps",
            title: "Approve npm install",
            detail: "Permission requested",
            last_event_at: T0,
          },
          { id: "S2", status: "active" },
          { id: "S3", status: "active", title: "", detail: "" },
        ],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records, T0 + 60_000);
    expect(records).toEqual(snapshot);
  });
});

describe("cardsFromState sparse subagent record stays minimal", () => {
  it("yields only {id, status} when no narrative wire keys are present", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    const sub = cards[0].subagents[0];
    expect(sub.id).toBe("S");
    expect(sub.status).toBe("active");
    // None of the new narrative keys should leak onto a sparse projection.
    expect("title" in sub).toBe(false);
    expect("detail" in sub).toBe(false);
    expect("elapsed" in sub).toBe(false);
    expect("relative_time" in sub).toBe(false);
    expect("instance" in sub).toBe(false);
    expect("needs_tag" in sub).toBe(false);
  });
});
