// claude-display Tweaks-panel persistence layer: pure helpers for hydrating
// the active-tones / visible-fields selections from a caller-supplied
// storage stub on mount, and writing them back when either changes. Single
// source of truth for the storage keys and for the allow-list-filtered
// JSON shape used on the wire. Settled in chore [039]; mirrors the
// "frozen lookup + tolerant resolver" shape of sibling source
// status-tones.js. Dependency-free at module scope: no DOM references, no
// browser-storage references, no runtime imports — the storage and
// scheduler are injected by the caller (see `mount()` in app.js) so the
// hydrate + write path is unit-testable via bun:test with a Map-backed
// storage stub and a synchronous scheduler.

export const LS_KEY_TONES = "claude-display.tweaks.activeTones";
export const LS_KEY_FIELDS = "claude-display.tweaks.visibleFields";

// Internal helper: read `key` from `storage` and parse it as a JSON array.
// Returns the array on success; returns `null` on every error path
// (missing value, non-string value, malformed JSON, non-array result) so
// the public hydrate helpers can fall back to the all-on default with a
// single nullish check. Never throws.
function readJsonArray(storage, key) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (typeof raw !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed;
}

// Internal helper: turn an Array-or-Set allow-list into a Set for fast
// membership checks. Pure; never mutates the input.
function toSet(allowList) {
  if (allowList instanceof Set) return allowList;
  return new Set(allowList);
}

// Internal helper: shared hydrate path. Reads the stored array, intersects
// it with `allowList`, and returns a fresh Set containing the recognized
// members. Returns a fresh `new Set(allowList)` when the stored value is
// missing, malformed, the wrong shape, or filters down to zero recognized
// entries. Never throws.
function hydrateFromStorage(storage, key, allowList) {
  const allowed = toSet(allowList);
  const arr = readJsonArray(storage, key);
  if (arr === null) return new Set(allowed);
  const recognized = new Set();
  for (const entry of arr) {
    if (allowed.has(entry)) recognized.add(entry);
  }
  if (recognized.size === 0) return new Set(allowed);
  return recognized;
}

// Pure helper: read the persisted active-tones selection from `storage`,
// returning a fresh Set of the recognized subset. Falls back to a fresh
// `new Set(allowList)` (all-on default) on every error or empty path.
// Never throws. The storage stub conforms to the `getItem(key)` shape
// and may be the real browser-side store, a no-op stub, or a Map-backed
// test stub.
export function hydrateActiveTones(storage, allowList) {
  return hydrateFromStorage(storage, LS_KEY_TONES, allowList);
}

// Pure helper: same shape as `hydrateActiveTones`, reads the persisted
// visible-fields selection from `LS_KEY_FIELDS`. Returns a fresh
// `new Set(allowList)` on every default path. Never throws.
export function hydrateVisibleFields(storage, allowList) {
  return hydrateFromStorage(storage, LS_KEY_FIELDS, allowList);
}

// Pure helper: serialize `set` to a JSON string of an array containing
// exactly the entries that appear in BOTH `set` and `allowList`. Members
// of `set` that are not in `allowList` are dropped (so a stray
// opaque-string toggle never persists garbage); members of `allowList`
// that are not in `set` are also dropped (the array reflects the on-state,
// not the universe). Pure: never mutates its inputs. Accepts both an
// Array and a Set as `allowList`.
export function serializeSet(set, allowList) {
  const allowed = toSet(allowList);
  const out = [];
  for (const entry of set) {
    if (allowed.has(entry)) out.push(entry);
  }
  return JSON.stringify(out);
}

// Internal helper: shared write path. Serializes `set` filtered by
// `allowList` and writes it under `key`. Catches and swallows any
// synchronous exception thrown by `setItem` (e.g. a quota error in
// private browsing, a `null` storage) so the dashboard keeps running
// even when storage refuses writes. Returns `undefined`.
function writeToStorage(storage, key, set, allowList) {
  const value = serializeSet(set, allowList);
  try {
    storage.setItem(key, value);
  } catch {
    // swallow — persistence is best-effort
  }
}

// Side-effect helper: persist the active-tones selection. Returns
// `undefined`. Swallows `setItem` exceptions.
export function writeActiveTones(storage, set, allowList) {
  writeToStorage(storage, LS_KEY_TONES, set, allowList);
}

// Side-effect helper: persist the visible-fields selection. Returns
// `undefined`. Swallows `setItem` exceptions.
export function writeVisibleFields(storage, set, allowList) {
  writeToStorage(storage, LS_KEY_FIELDS, set, allowList);
}

// Pure factory: returns a `{ schedule(snapshot) }` API that coalesces a
// burst of synchronous schedules into one deferred `write(latestSnapshot)`
// call. The injected `scheduleWrite(flush)` defers the flush — tests pass
// a recording stub; production passes `queueMicrotask` (or any other
// "run-this-once" scheduler). The wrapper re-arms after a flush, so a
// second burst yields a second write. The scheduler is the only path to a
// write — `schedule()` never calls `write` synchronously.
export function createCoalescingWriter(scheduleWrite, write) {
  let latest;
  let armed = false;
  let hasPending = false;
  function flush() {
    armed = false;
    if (!hasPending) return;
    const snapshot = latest;
    hasPending = false;
    latest = undefined;
    write(snapshot);
  }
  return {
    schedule(snapshot) {
      latest = snapshot;
      hasPending = true;
      if (armed) return;
      armed = true;
      scheduleWrite(flush);
    },
  };
}
