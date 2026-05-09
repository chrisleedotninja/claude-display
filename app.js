// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
export function cardsFromState(records) {
  return records.map((r) => ({ id: r.id, status: r.status }));
}
