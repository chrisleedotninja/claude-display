import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { toggleVisibleField, stripHiddenFields } from "../app.js";
import { createServer } from "../server.js";

describe("toggleVisibleField pure helper (Step 1)", () => {
  it("returns a Set with the toggled field removed when previously present", () => {
    const prev = new Set(["repo", "branch", "session", "desktop", "elapsed"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next.has("branch")).toBe(false);
    expect(next.has("repo")).toBe(true);
    expect(next.has("session")).toBe(true);
    expect(next.has("desktop")).toBe(true);
    expect(next.has("elapsed")).toBe(true);
  });

  it("returns a Set with the toggled field added when previously absent", () => {
    const prev = new Set(["repo", "session"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next.has("branch")).toBe(true);
    expect(next.has("repo")).toBe(true);
    expect(next.has("session")).toBe(true);
  });

  it("returns a different Set instance from the input", () => {
    const prev = new Set(["repo"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next).not.toBe(prev);
    expect(next instanceof Set).toBe(true);
  });

  it("does not mutate the input Set", () => {
    const prev = new Set(["repo", "branch"]);
    const snapshot = new Set(prev);
    toggleVisibleField(prev, "branch");
    expect(prev.size).toBe(snapshot.size);
    for (const field of snapshot) {
      expect(prev.has(field)).toBe(true);
    }
    // The branch field should still be in prev — it was not mutated.
    expect(prev.has("branch")).toBe(true);
  });

  it("passes through unrecognized field strings (toggles them as opaque strings) without throwing", () => {
    const prev = new Set(["repo"]);
    expect(() => toggleVisibleField(prev, "made-up-field")).not.toThrow();
    const added = toggleVisibleField(prev, "made-up-field");
    expect(added.has("made-up-field")).toBe(true);
    const removed = toggleVisibleField(added, "made-up-field");
    expect(removed.has("made-up-field")).toBe(false);
  });
});

describe("stripHiddenFields pure helper (Step 2)", () => {
  function makeFullCard(id) {
    return {
      id,
      status: "working",
      color: "#abc",
      icon: "•",
      label: "Working",
      repo: "claude-display",
      branch: "main",
      session_label: "tmux:0",
      desktop: "alpha",
      elapsed: "5s",
      last_event_at: 1700000000000,
    };
  }
  const ALL = new Set(["repo", "branch", "session", "desktop", "elapsed"]);

  it("when visibleFields contains all five names, returns cards whose five metadata properties are unchanged", () => {
    const cards = [makeFullCard("a"), makeFullCard("b")];
    const out = stripHiddenFields(cards, ALL);
    expect(out).toHaveLength(2);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].repo).toBe(cards[i].repo);
      expect(out[i].branch).toBe(cards[i].branch);
      expect(out[i].session_label).toBe(cards[i].session_label);
      expect(out[i].desktop).toBe(cards[i].desktop);
      expect(out[i].elapsed).toBe(cards[i].elapsed);
    }
  });

  it("when visibleFields omits 'repo', returns cards with no own repo property", () => {
    const cards = [makeFullCard("a")];
    const visible = new Set(["branch", "session", "desktop", "elapsed"]);
    const out = stripHiddenFields(cards, visible);
    expect(Object.hasOwn(out[0], "repo")).toBe(false);
    // The other fields survive.
    expect(out[0].branch).toBe("main");
    expect(out[0].session_label).toBe("tmux:0");
    expect(out[0].desktop).toBe("alpha");
    expect(out[0].elapsed).toBe("5s");
  });

  it("when visibleFields omits 'session', returns cards with no own session_label property (verifies the session → session_label mapping)", () => {
    const cards = [makeFullCard("a")];
    const visible = new Set(["repo", "branch", "desktop", "elapsed"]);
    const out = stripHiddenFields(cards, visible);
    expect(Object.hasOwn(out[0], "session_label")).toBe(false);
    // Ensure we did not strip a literally-named "session" property either.
    expect(Object.hasOwn(out[0], "session")).toBe(false);
    expect(out[0].repo).toBe("claude-display");
  });

  it("for a card whose input has no desktop, removing desktop from visibleFields produces a card whose output also has no desktop (AC4)", () => {
    const card = makeFullCard("a");
    delete card.desktop;
    const visible = new Set(["repo", "branch", "session", "elapsed"]);
    const out = stripHiddenFields([card], visible);
    expect(Object.hasOwn(out[0], "desktop")).toBe(false);
    // Other fields the input carried still appear.
    expect(out[0].repo).toBe("claude-display");
    expect(out[0].elapsed).toBe("5s");
  });

  it("toggling one field off does not strip any other field (AC3 independence)", () => {
    const cards = [makeFullCard("a")];
    const visible = new Set(["repo", "session", "desktop", "elapsed"]);
    const out = stripHiddenFields(cards, visible);
    // Only branch is hidden.
    expect(Object.hasOwn(out[0], "branch")).toBe(false);
    expect(out[0].repo).toBe("claude-display");
    expect(out[0].session_label).toBe("tmux:0");
    expect(out[0].desktop).toBe("alpha");
    expect(out[0].elapsed).toBe("5s");
  });

  it("does not mutate the input cards array or its card objects", () => {
    const cards = [makeFullCard("a"), makeFullCard("b")];
    const inputRef0 = cards[0];
    const inputRef1 = cards[1];
    const snapshotKeys0 = Object.keys(inputRef0).sort();
    const snapshotKeys1 = Object.keys(inputRef1).sort();
    const visible = new Set(["session", "elapsed"]);
    stripHiddenFields(cards, visible);
    expect(cards.length).toBe(2);
    expect(cards[0]).toBe(inputRef0);
    expect(cards[1]).toBe(inputRef1);
    expect(Object.keys(inputRef0).sort()).toEqual(snapshotKeys0);
    expect(Object.keys(inputRef1).sort()).toEqual(snapshotKeys1);
  });

  it("returns a fresh array reference and each returned card is a fresh object reference", () => {
    const cards = [makeFullCard("a"), makeFullCard("b")];
    const out = stripHiddenFields(cards, ALL);
    expect(out).not.toBe(cards);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).not.toBe(cards[i]);
    }
  });
});

describe("served /app.js initialises visibleFields to the full five-field set (Step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js declares `let visibleFields` and initialises it with all five field names", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Locate the substring spanning a `let visibleFields` declaration
    // through the next `;` and verify it contains each of the five
    // quoted field-name strings.
    const declRe = /let\s+visibleFields\b[^;]*;/;
    const m = body.match(declRe);
    expect(m).not.toBeNull();
    const decl = m[0];
    // Must be a `new Set([...])` construction whose array literal includes
    // each of the five field names.
    expect(/new\s+Set\s*\(\s*\[/.test(decl)).toBe(true);
    for (const field of ["repo", "branch", "session", "desktop", "elapsed"]) {
      // Tolerant of single or double quotes.
      const fieldRe = new RegExp(`["']${field}["']`);
      expect(fieldRe.test(decl)).toBe(true);
    }
  });
});

describe("served /app.js renders one field-toggle control per metadata field inside the panel body (Step 4)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-field-toggle class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-field-toggle")).toBe(true);
  });

  it("served /app.js mentions the is-on on-state modifier string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("is-on")).toBe(true);
  });

  it("renders all five field-name labels inside the panel-body span", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Walk forward from the panel-surface class to the surface template's
    // closing backtick — same surfaceIdx → closeIdx walk used in
    // test/tweaks-panel-tone-filters.test.js Step 4.
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    expect(surfaceIdx).toBeGreaterThan(-1);
    const bodyIdx = body.indexOf("tweaks-panel-body", surfaceIdx);
    expect(bodyIdx).toBeGreaterThan(surfaceIdx);
    const closeIdx = body.indexOf("`", surfaceIdx);
    expect(closeIdx).toBeGreaterThan(bodyIdx);
    const span = body.slice(bodyIdx, closeIdx);
    for (const field of ["repo", "branch", "session", "desktop", "elapsed"]) {
      expect(span.includes(field)).toBe(true);
    }
  });

  it("wires the new controls with onClick (or onclick) inside the surface span", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    const closeIdx = body.indexOf("`", surfaceIdx);
    const span = body.slice(surfaceIdx, closeIdx);
    const hasClickHandler = /\bonClick\b/.test(span) || /\bonclick\b/.test(span);
    expect(hasClickHandler).toBe(true);
  });

  it("the existing tweaks-tone-filter substring still appears within the same panel-body span (added alongside, not in place of)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    const closeIdx = body.indexOf("`", surfaceIdx);
    const span = body.slice(surfaceIdx, closeIdx);
    expect(span.includes("tweaks-tone-filter")).toBe(true);
    expect(span.includes("tweaks-field-toggle")).toBe(true);
  });
});
