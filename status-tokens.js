// claude-display status taxonomy: the eight color + icon + label tokens shared
// by view-model construction (cardsFromState in app.js) and the rendered Card
// component. Single source of truth so a sibling slice can reuse the table
// without restating it. Settled in parent specs [001] and [004]; see also
// docs/decisions/0001-heartbeat-stack.md (no webfont/icon-font dependency, so
// icons are single Unicode geometric glyphs) and chore [017] (server-side
// out-of-list collapse to "idle" — same anchor used here on the client).

export const STATUS_TOKENS = Object.freeze({
  approval: Object.freeze({ color: "#ff9e64", icon: "?", label: "Approval" }),
  waiting: Object.freeze({ color: "#e0af68", icon: "⋯", label: "Waiting" }),
  blocked: Object.freeze({ color: "#f7768e", icon: "!", label: "Blocked" }),
  working: Object.freeze({ color: "#7aa2f7", icon: "▶", label: "Working" }),
  tests: Object.freeze({ color: "#7dcfff", icon: "▣", label: "Tests" }),
  reviewing: Object.freeze({ color: "#bb9af7", icon: "◉", label: "Review" }),
  success: Object.freeze({ color: "#9ece6a", icon: "✓", label: "Success" }),
  idle: Object.freeze({ color: "#565f89", icon: "○", label: "Idle" }),
});

// Pure resolver. Returns the matching frozen entry for any of the eight
// allow-list strings; for anything else (undefined, null, empty string,
// non-string, or unknown string) returns the same frozen idle entry.
export function tokensForStatus(status) {
  if (typeof status === "string" && Object.hasOwn(STATUS_TOKENS, status)) {
    return STATUS_TOKENS[status];
  }
  return STATUS_TOKENS.idle;
}

// Sibling table on the status axis: which statuses are "attention" — i.e. the
// dashboard should treat them as visually loud (rail + pulse). Settled in
// parent spec [004]; the visual treatment is added by chore [019].
export const ATTENTION_STATUSES = Object.freeze(
  new Set(["approval", "waiting", "blocked"]),
);

// Pure predicate. Returns true only for the three attention-set strings;
// false for any other input (other allow-list keys, unknown strings, empty
// string, undefined, null, non-string), mirroring tokensForStatus's tolerance.
export function isAttentionStatus(status) {
  return typeof status === "string" && ATTENTION_STATUSES.has(status);
}
