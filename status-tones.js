// claude-display tone-group taxonomy: partitions the eight statuses (see
// status-tokens.js) into the four tone groups the Tweaks panel filters on.
// Single source of truth for the status-to-tone partition and for the pure
// helpers that consume it (toneForStatus, filterCardsByTones). Settled in
// parent spec [008]; mirrors the "frozen lookup + tolerant resolver" shape of
// sibling source status-tokens.js. Dependency-free: no DOM, no runtime
// imports, no dependency on status-tokens.js.

export const TONE_GROUPS = Object.freeze(
  new Set(["attention", "active", "success", "neutral"]),
);
