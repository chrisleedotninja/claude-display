import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  LS_KEY_TONES,
  LS_KEY_FIELDS,
  hydrateActiveTones,
  hydrateVisibleFields,
  serializeSet,
  writeActiveTones,
  writeVisibleFields,
  createCoalescingWriter,
} from "../tweaks-persistence.js";
import { createServer } from "../server.js";

// `Map`-backed storage stub. Mirrors the Web Storage shape the persistence
// module accepts. `getItem` returns `null` for missing keys (matching
// real-browser localStorage).
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _map: map,
  };
}

const TONES = ["attention", "active", "success", "neutral"];
const FIELDS = ["repo", "branch", "session", "desktop", "elapsed"];

describe("hydrateActiveTones (Step 1)", () => {
  it("returns a fresh Set equal to new Set(allowList) when storage has no value", () => {
    const storage = makeStorage();
    const out = hydrateActiveTones(storage, TONES);
    expect(out instanceof Set).toBe(true);
    expect(out.size).toBe(TONES.length);
    for (const t of TONES) expect(out.has(t)).toBe(true);
  });

  it("returns the default when getItem returns a non-string (undefined / number)", () => {
    const weirdStorage = {
      getItem: () => undefined,
      setItem: () => {},
    };
    const out1 = hydrateActiveTones(weirdStorage, TONES);
    expect(out1.size).toBe(TONES.length);
    const numStorage = { getItem: () => 42, setItem: () => {} };
    const out2 = hydrateActiveTones(numStorage, TONES);
    expect(out2.size).toBe(TONES.length);
  });

  it("returns the default when stored value is malformed JSON", () => {
    const storage = makeStorage({ [LS_KEY_TONES]: "{not json" });
    const out = hydrateActiveTones(storage, TONES);
    expect(out.size).toBe(TONES.length);
    for (const t of TONES) expect(out.has(t)).toBe(true);
  });

  it("returns the default when JSON parses to a non-array (object / number / string)", () => {
    for (const value of ["{}", "42", '"a string"']) {
      const storage = makeStorage({ [LS_KEY_TONES]: value });
      const out = hydrateActiveTones(storage, TONES);
      expect(out.size).toBe(TONES.length);
    }
  });

  it("returns the default when the array contains zero recognized entries", () => {
    const storage = makeStorage({
      [LS_KEY_TONES]: JSON.stringify(["foo", "bar"]),
    });
    const out = hydrateActiveTones(storage, TONES);
    expect(out.size).toBe(TONES.length);
    for (const t of TONES) expect(out.has(t)).toBe(true);
  });

  it("returns a Set containing exactly the recognized subset, dropping unknown entries", () => {
    const storage = makeStorage({
      [LS_KEY_TONES]: JSON.stringify(["attention", "made-up", "active"]),
    });
    const out = hydrateActiveTones(storage, TONES);
    expect(out.size).toBe(2);
    expect(out.has("attention")).toBe(true);
    expect(out.has("active")).toBe(true);
    expect(out.has("made-up")).toBe(false);
    expect(out.has("success")).toBe(false);
    expect(out.has("neutral")).toBe(false);
  });

  it("returns a different Set instance from any input", () => {
    const storage = makeStorage();
    const out = hydrateActiveTones(storage, TONES);
    expect(out).not.toBe(TONES);
    expect(out instanceof Set).toBe(true);
  });

  it("never throws under any of the documented branches", () => {
    const cases = [
      makeStorage(),
      { getItem: () => undefined, setItem: () => {} },
      makeStorage({ [LS_KEY_TONES]: "{not json" }),
      makeStorage({ [LS_KEY_TONES]: "{}" }),
      makeStorage({ [LS_KEY_TONES]: JSON.stringify(["foo"]) }),
      makeStorage({
        [LS_KEY_TONES]: JSON.stringify(["attention", "made-up"]),
      }),
    ];
    for (const storage of cases) {
      expect(() => hydrateActiveTones(storage, TONES)).not.toThrow();
    }
  });

  it("accepts a Set as the allowList", () => {
    const storage = makeStorage({
      [LS_KEY_TONES]: JSON.stringify(["attention"]),
    });
    const out = hydrateActiveTones(storage, new Set(TONES));
    expect(out.size).toBe(1);
    expect(out.has("attention")).toBe(true);
  });
});

describe("hydrateVisibleFields (Step 2)", () => {
  it("returns a fresh Set equal to new Set(allowList) when storage has no value", () => {
    const storage = makeStorage();
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out instanceof Set).toBe(true);
    expect(out.size).toBe(FIELDS.length);
    for (const f of FIELDS) expect(out.has(f)).toBe(true);
  });

  it("returns the default when getItem returns a non-string", () => {
    const weirdStorage = { getItem: () => undefined, setItem: () => {} };
    const out = hydrateVisibleFields(weirdStorage, FIELDS);
    expect(out.size).toBe(FIELDS.length);
  });

  it("returns the default when stored value is malformed JSON", () => {
    const storage = makeStorage({ [LS_KEY_FIELDS]: "{not json" });
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out.size).toBe(FIELDS.length);
  });

  it("returns the default when JSON parses to a non-array", () => {
    for (const value of ["{}", "42", '"hi"']) {
      const storage = makeStorage({ [LS_KEY_FIELDS]: value });
      const out = hydrateVisibleFields(storage, FIELDS);
      expect(out.size).toBe(FIELDS.length);
    }
  });

  it("returns the default when the array contains zero recognized entries", () => {
    const storage = makeStorage({
      [LS_KEY_FIELDS]: JSON.stringify(["foo", "bar"]),
    });
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out.size).toBe(FIELDS.length);
  });

  it("returns a Set containing exactly the recognized subset, dropping unknown entries", () => {
    const storage = makeStorage({
      [LS_KEY_FIELDS]: JSON.stringify(["repo", "made-up", "session"]),
    });
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out.size).toBe(2);
    expect(out.has("repo")).toBe(true);
    expect(out.has("session")).toBe(true);
    expect(out.has("made-up")).toBe(false);
    expect(out.has("branch")).toBe(false);
  });

  it("returns a different Set instance from any input", () => {
    const storage = makeStorage();
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out).not.toBe(FIELDS);
    expect(out instanceof Set).toBe(true);
  });

  it("never throws under any of the documented branches", () => {
    const cases = [
      makeStorage(),
      { getItem: () => undefined, setItem: () => {} },
      makeStorage({ [LS_KEY_FIELDS]: "{not json" }),
      makeStorage({ [LS_KEY_FIELDS]: "{}" }),
      makeStorage({ [LS_KEY_FIELDS]: JSON.stringify(["foo"]) }),
      makeStorage({
        [LS_KEY_FIELDS]: JSON.stringify(["repo", "made-up"]),
      }),
    ];
    for (const storage of cases) {
      expect(() => hydrateVisibleFields(storage, FIELDS)).not.toThrow();
    }
  });
});

describe("serializeSet (Step 3)", () => {
  it("returns a JSON-encoded array", () => {
    const out = serializeSet(new Set(["attention"]), TONES);
    expect(typeof out).toBe("string");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("when set ⊆ allowList, the parsed array contains exactly the entries of set", () => {
    const set = new Set(["attention", "success"]);
    const parsed = JSON.parse(serializeSet(set, TONES));
    expect(parsed.length).toBe(2);
    expect(parsed.includes("attention")).toBe(true);
    expect(parsed.includes("success")).toBe(true);
  });

  it("drops entries that are in set but not in allowList", () => {
    const set = new Set(["attention", "made-up"]);
    const parsed = JSON.parse(serializeSet(set, TONES));
    expect(parsed.length).toBe(1);
    expect(parsed.includes("attention")).toBe(true);
    expect(parsed.includes("made-up")).toBe(false);
  });

  it("returns [] when set is empty", () => {
    const parsed = JSON.parse(serializeSet(new Set(), TONES));
    expect(parsed).toEqual([]);
  });

  it("does not mutate set or allowList", () => {
    const set = new Set(["attention", "active"]);
    const setSnapshot = new Set(set);
    const allowList = TONES.slice();
    const allowListSnapshot = allowList.slice();
    serializeSet(set, allowList);
    expect(set.size).toBe(setSnapshot.size);
    for (const v of setSnapshot) expect(set.has(v)).toBe(true);
    expect(allowList).toEqual(allowListSnapshot);
  });

  it("accepts both an Array and a Set as allowList and produces equivalent results", () => {
    const set = new Set(["attention", "success"]);
    const fromArray = JSON.parse(serializeSet(set, TONES));
    const fromSet = JSON.parse(serializeSet(set, new Set(TONES)));
    expect(fromArray.sort()).toEqual(fromSet.sort());
  });
});

describe("writeActiveTones / writeVisibleFields (Step 4)", () => {
  it("writeActiveTones calls setItem with LS_KEY_TONES and the JSON-encoded recognized subset", () => {
    const storage = makeStorage();
    writeActiveTones(storage, new Set(["attention", "success", "made-up"]), TONES);
    const stored = storage._map.get(LS_KEY_TONES);
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored);
    expect(parsed.includes("attention")).toBe(true);
    expect(parsed.includes("success")).toBe(true);
    expect(parsed.includes("made-up")).toBe(false);
  });

  it("writeVisibleFields calls setItem with LS_KEY_FIELDS and the JSON-encoded recognized subset", () => {
    const storage = makeStorage();
    writeVisibleFields(storage, new Set(["repo", "elapsed", "made-up"]), FIELDS);
    const stored = storage._map.get(LS_KEY_FIELDS);
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored);
    expect(parsed.includes("repo")).toBe(true);
    expect(parsed.includes("elapsed")).toBe(true);
    expect(parsed.includes("made-up")).toBe(false);
  });

  it("round-trip: hydrateActiveTones after writeActiveTones returns a Set whose membership equals the input", () => {
    const storage = makeStorage();
    const input = new Set(["attention", "neutral"]);
    writeActiveTones(storage, input, TONES);
    const out = hydrateActiveTones(storage, TONES);
    expect(out.size).toBe(input.size);
    for (const v of input) expect(out.has(v)).toBe(true);
  });

  it("round-trip: hydrateVisibleFields after writeVisibleFields returns a Set whose membership equals the input", () => {
    const storage = makeStorage();
    const input = new Set(["branch", "desktop"]);
    writeVisibleFields(storage, input, FIELDS);
    const out = hydrateVisibleFields(storage, FIELDS);
    expect(out.size).toBe(input.size);
    for (const v of input) expect(out.has(v)).toBe(true);
  });

  it("swallows setItem throws and returns undefined", () => {
    const throwy = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    let outA, outF;
    expect(() => {
      outA = writeActiveTones(throwy, new Set(["attention"]), TONES);
    }).not.toThrow();
    expect(() => {
      outF = writeVisibleFields(throwy, new Set(["repo"]), FIELDS);
    }).not.toThrow();
    expect(outA).toBeUndefined();
    expect(outF).toBeUndefined();
  });

  it("does not mutate the set input", () => {
    const storage = makeStorage();
    const set = new Set(["attention", "success"]);
    const snapshot = new Set(set);
    writeActiveTones(storage, set, TONES);
    expect(set.size).toBe(snapshot.size);
    for (const v of snapshot) expect(set.has(v)).toBe(true);
  });
});

describe("createCoalescingWriter (Step 5)", () => {
  function makeScheduler() {
    let queued = null;
    return {
      schedule: (fn) => {
        queued = fn;
      },
      run: () => {
        if (queued) {
          const fn = queued;
          queued = null;
          fn();
        }
      },
      hasQueued: () => queued !== null,
    };
  }

  it("calls write exactly once with the supplied snapshot when scheduled once and the scheduler runs", () => {
    const sched = makeScheduler();
    const writes = [];
    const w = createCoalescingWriter(sched.schedule, (s) => writes.push(s));
    w.schedule({ value: "a" });
    expect(writes.length).toBe(0);
    sched.run();
    expect(writes.length).toBe(1);
    expect(writes[0]).toEqual({ value: "a" });
  });

  it("collapses N synchronous schedules into one write of the final snapshot", () => {
    const sched = makeScheduler();
    const writes = [];
    const w = createCoalescingWriter(sched.schedule, (s) => writes.push(s));
    w.schedule("s1");
    w.schedule("s2");
    w.schedule("s3");
    w.schedule("s4");
    w.schedule("s5");
    sched.run();
    expect(writes.length).toBe(1);
    expect(writes[0]).toBe("s5");
  });

  it("re-arms after a flush — second burst flushes too", () => {
    const sched = makeScheduler();
    const writes = [];
    const w = createCoalescingWriter(sched.schedule, (s) => writes.push(s));
    w.schedule("first");
    sched.run();
    w.schedule("second");
    sched.run();
    expect(writes.length).toBe(2);
    expect(writes[0]).toBe("first");
    expect(writes[1]).toBe("second");
  });

  it("does not call write synchronously inside schedule (a flush is always deferred)", () => {
    const sched = makeScheduler();
    const writes = [];
    const w = createCoalescingWriter(sched.schedule, (s) => writes.push(s));
    w.schedule("a");
    expect(writes.length).toBe(0);
    w.schedule("b");
    expect(writes.length).toBe(0);
  });

  it("does not arm a second scheduler call while one is already in flight", () => {
    let scheduleCount = 0;
    let queued = null;
    const scheduler = (fn) => {
      scheduleCount++;
      queued = fn;
    };
    const w = createCoalescingWriter(scheduler, () => {});
    w.schedule("a");
    w.schedule("b");
    w.schedule("c");
    expect(scheduleCount).toBe(1);
    queued();
    w.schedule("d");
    expect(scheduleCount).toBe(2);
  });
});

describe("served /app.js wires hydrate at the activeTones / visibleFields initialisers (Step 6)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("imports hydrateActiveTones and hydrateVisibleFields from ./tweaks-persistence.js", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const importRe =
      /import\s*\{[^}]*\}\s*from\s*["']\.\/tweaks-persistence\.js["']/;
    const m = body.match(importRe);
    expect(m).not.toBeNull();
    const importBlock = m[0];
    expect(importBlock.includes("hydrateActiveTones")).toBe(true);
    expect(importBlock.includes("hydrateVisibleFields")).toBe(true);
  });

  it("the let activeTones declaration through the next ; references hydrateActiveTones( and TONE_GROUPS", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const declRe = /let\s+activeTones\b[^;]*;/;
    const m = body.match(declRe);
    expect(m).not.toBeNull();
    const decl = m[0];
    expect(decl.includes("hydrateActiveTones(")).toBe(true);
    expect(decl.includes("TONE_GROUPS")).toBe(true);
  });

  it("the let visibleFields declaration through the next ; references hydrateVisibleFields( and the five field-name literals", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const declRe = /let\s+visibleFields\b[^;]*;/;
    const m = body.match(declRe);
    expect(m).not.toBeNull();
    const decl = m[0];
    expect(decl.includes("hydrateVisibleFields(")).toBe(true);
    for (const field of FIELDS) {
      const fieldRe = new RegExp(`["']${field}["']`);
      expect(fieldRe.test(decl)).toBe(true);
    }
  });
});

describe("served /app.js toggle handlers schedule a coalesced write (Step 7)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references createCoalescingWriter by name in the served body", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("createCoalescingWriter")).toBe(true);
  });

  it("references writeActiveTones and writeVisibleFields by name in the served body", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("writeActiveTones")).toBe(true);
    expect(body.includes("writeVisibleFields")).toBe(true);
  });

  it("the toggle-tone handler window mentions a .schedule( (or similar) call referencing activeTones", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // First occurrence is `export function toggleActiveTone`; the second
    // is the handler use site.
    const useIdx = body.indexOf("toggleActiveTone(", body.indexOf("toggleActiveTone") + 1);
    expect(useIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, useIdx - 200);
    const windowEnd = Math.min(body.length, useIdx + 600);
    const span = body.slice(windowStart, windowEnd);
    // A coalesced-writer schedule call referencing activeTones (or a direct
    // write call) must appear in the same handler window.
    const hasSchedule = /\.schedule\s*\([^)]*activeTones/.test(span) ||
      /writeActiveTones\s*\([^)]*activeTones/.test(span);
    expect(hasSchedule).toBe(true);
  });

  it("the toggle-field handler window mentions a .schedule( (or similar) call referencing visibleFields", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const useIdx = body.indexOf("toggleVisibleField(", body.indexOf("toggleVisibleField") + 1);
    expect(useIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, useIdx - 200);
    const windowEnd = Math.min(body.length, useIdx + 600);
    const span = body.slice(windowStart, windowEnd);
    const hasSchedule = /\.schedule\s*\([^)]*visibleFields/.test(span) ||
      /writeVisibleFields\s*\([^)]*visibleFields/.test(span);
    expect(hasSchedule).toBe(true);
  });

  it("the existing draw() call inside both handlers still appears (regression-guard for chores [036] / [037])", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const toneUseIdx = body.indexOf("toggleActiveTone(", body.indexOf("toggleActiveTone") + 1);
    const fieldUseIdx = body.indexOf("toggleVisibleField(", body.indexOf("toggleVisibleField") + 1);
    const toneSpan = body.slice(Math.max(0, toneUseIdx - 200), Math.min(body.length, toneUseIdx + 600));
    const fieldSpan = body.slice(Math.max(0, fieldUseIdx - 200), Math.min(body.length, fieldUseIdx + 600));
    expect(/\bdraw\s*\(/.test(toneSpan)).toBe(true);
    expect(/\bdraw\s*\(/.test(fieldSpan)).toBe(true);
  });
});

describe("served /app.js mount() falls back when localStorage is undefined (Step 8)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains the substring `typeof localStorage` somewhere in the served source", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("typeof localStorage")).toBe(true);
  });

  it("the typeof localStorage span mentions a no-op fallback (getItem / setItem) or globalThis.localStorage", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const idx = body.indexOf("typeof localStorage");
    expect(idx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, idx - 200);
    const windowEnd = Math.min(body.length, idx + 600);
    const span = body.slice(windowStart, windowEnd);
    const hasGlobalThis = /globalThis\.localStorage/.test(span);
    const hasFallback = /getItem/.test(span) && /setItem/.test(span);
    expect(hasGlobalThis || hasFallback).toBe(true);
  });

  it("the existing typeof EventSource !== \"undefined\" guard is preserved (chore [014] regression-guard)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/typeof\s+EventSource\s*!==\s*["']undefined["']/.test(body)).toBe(true);
  });
});

describe("served /tweaks-persistence.js is dependency-free at module scope (Step 9)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("the served module body does not contain the substring localStorage", async () => {
    const body = await (await fetch(`${baseUrl}/tweaks-persistence.js`)).text();
    expect(body.includes("localStorage")).toBe(false);
  });

  it("the served module body does not contain the substring window.", async () => {
    const body = await (await fetch(`${baseUrl}/tweaks-persistence.js`)).text();
    expect(body.includes("window.")).toBe(false);
  });

  it("the served module body does not contain the substring document.", async () => {
    const body = await (await fetch(`${baseUrl}/tweaks-persistence.js`)).text();
    expect(body.includes("document.")).toBe(false);
  });

  it("exports each of the documented symbols", async () => {
    const body = await (await fetch(`${baseUrl}/tweaks-persistence.js`)).text();
    for (const sym of [
      "LS_KEY_TONES",
      "LS_KEY_FIELDS",
      "hydrateActiveTones",
      "hydrateVisibleFields",
      "serializeSet",
      "writeActiveTones",
      "writeVisibleFields",
      "createCoalescingWriter",
    ]) {
      // tolerant of `export const NAME` / `export function NAME`
      const exportRe = new RegExp(`export\\s+(?:const|function|let|var)\\s+${sym}\\b`);
      expect(exportRe.test(body)).toBe(true);
    }
  });
});

describe("server static route /tweaks-persistence.js (Step 10)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("GET /tweaks-persistence.js returns 200 with the module body", async () => {
    const res = await fetch(`${baseUrl}/tweaks-persistence.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("LS_KEY_TONES")).toBe(true);
    expect(body.includes("hydrateActiveTones")).toBe(true);
  });

  it("preserves the 404 fallback for unrelated unknown static paths", async () => {
    const res = await fetch(`${baseUrl}/not-a-real-path.js`);
    expect(res.status).toBe(404);
  });
});

describe("server-state isolation: persistence wiring stays client-side (Step 11)", () => {
  it("server.js source contains none of the persistence-symbol references", async () => {
    const path = require("node:path");
    const here = path.resolve(__dirname, "..");
    const serverSrc = await Bun.file(path.join(here, "server.js")).text();
    for (const sym of [
      "LS_KEY_TONES",
      "LS_KEY_FIELDS",
      "hydrateActiveTones",
      "hydrateVisibleFields",
      "serializeSet",
      "writeActiveTones",
      "writeVisibleFields",
      "createCoalescingWriter",
    ]) {
      expect(serverSrc.includes(sym)).toBe(false);
    }
  });
});

describe("HTML shape and existing-suite continuity (Step 12)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served / contains exactly one <div id=\"root\"></div> mount point", async () => {
    const body = await (await fetch(`${baseUrl}/`)).text();
    const matches = body.match(/<div\s+id\s*=\s*"root"\s*>\s*<\/div>/g) || [];
    expect(matches).toHaveLength(1);
  });

  it("served / contains exactly one /app.js module-script reference", async () => {
    const body = await (await fetch(`${baseUrl}/`)).text();
    const matches =
      body.match(/<script[^>]+type\s*=\s*"module"[^>]+src\s*=\s*"\/app\.js"[^>]*>/g) ||
      [];
    expect(matches).toHaveLength(1);
  });

  it("served /app.js contains no http(s) URL", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/https?:\/\//.test(body)).toBe(false);
  });

  it("served /app.js still contains the filterCardsByTones(cardsFromState(records substring (chore [036] regression)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/filterCardsByTones\s*\(\s*cardsFromState\s*\(\s*records\b/.test(body)).toBe(true);
  });

  it("served /app.js still contains a stripHiddenFields( use site whose args mention filterCardsByTones and visibleFields (chore [037] regression)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const firstIdx = body.indexOf("stripHiddenFields(");
    const useIdx = body.indexOf("stripHiddenFields(", firstIdx + 1);
    expect(useIdx).toBeGreaterThan(-1);
    // Walk balanced parens from the open-paren at useIdx + len.
    const openParen = useIdx + "stripHiddenFields".length;
    expect(body[openParen]).toBe("(");
    let depth = 1;
    let endIdx = -1;
    for (let i = openParen + 1; i < body.length; i++) {
      const c = body[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(openParen);
    const span = body.slice(openParen, endIdx + 1);
    expect(span.includes("filterCardsByTones")).toBe(true);
    expect(span.includes("visibleFields")).toBe(true);
  });
});
