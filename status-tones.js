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

// Frozen partition of the eight status strings into the four tone groups.
// `attention` = approval/waiting/blocked; `active` = working/tests/reviewing;
// `success` = success; `neutral` = idle. Locked by parent spec [008].
export const STATUS_TONES = Object.freeze({
  approval: "attention",
  waiting: "attention",
  blocked: "attention",
  working: "active",
  tests: "active",
  reviewing: "active",
  success: "success",
  idle: "neutral",
});

// Pure resolver. Returns the tone-group string for any of the eight
// allow-list statuses; for anything else (undefined, null, empty string,
// non-string, or unknown string) returns "neutral" — mirrors the tolerant
// fallback shape of tokensForStatus in status-tokens.js, and lands on the
// same group that owns "idle".
export function toneForStatus(status) {
  if (typeof status === "string" && Object.hasOwn(STATUS_TONES, status)) {
    return STATUS_TONES[status];
  }
  return "neutral";
}

// Pure card-list filter. Returns a new array containing exactly the cards
// whose `card.status` resolves (via toneForStatus) to a tone present in
// `activeTones`, preserving the original order. Never returns the input
// array reference; never mutates the input array or its cards.
export function filterCardsByTones(cards, activeTones) {
  return cards.filter((card) => activeTones.has(toneForStatus(card.status)));
}
