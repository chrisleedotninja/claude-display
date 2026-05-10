// claude-display needs taxonomy: the seven label + icon tokens shared by the
// "Needs from you" tag rendered on attention-state cards. Single source of
// truth for the seven wire-enum values (sibling chore [034] enforces the same
// allow-list on server.js). Settled in parent spec [006]; see also
// docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md (the wire-enum
// section) and docs/decisions/0001-heartbeat-stack.md (no webfont/icon-font
// dependency, so icons are single Unicode geometric/symbol glyphs).

export const NEEDS_TOKENS = Object.freeze({
  "approve-tool": Object.freeze({ label: "Approve tool", icon: "✓" }),
  "answer-question": Object.freeze({ label: "Answer question", icon: "?" }),
  "provide-input": Object.freeze({ label: "Provide input", icon: "✎" }),
  "pick-option": Object.freeze({ label: "Pick option", icon: "◆" }),
  "confirm-destructive": Object.freeze({
    label: "Confirm destructive",
    icon: "⚠",
  }),
  "resolve-conflict": Object.freeze({ label: "Resolve conflict", icon: "⤫" }),
  "review-diff": Object.freeze({ label: "Review diff", icon: "≣" }),
});

// Pure resolver. Returns the matching frozen entry for any of the seven
// wire-enum keys; for anything else (undefined, null, empty string, non-string,
// or unknown string) returns null. Mirrors tokensForStatus's defensive style:
// guard typeof first, then Object.hasOwn so prototype-chain members like
// "toString" are not treated as hits.
export function tokensForNeed(value) {
  if (typeof value === "string" && Object.hasOwn(NEEDS_TOKENS, value)) {
    return NEEDS_TOKENS[value];
  }
  return null;
}
