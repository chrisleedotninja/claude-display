// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";

const html = htm.bind(h);

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
export function cardsFromState(records) {
  return records.map((r) => ({ id: r.id, status: r.status }));
}

// Pure upsert: given the previous cards array and one incoming record,
// return a new cards array. If the record's id already appears in cards,
// the matching entry is replaced in place (same index, same length); if
// the id is new, the record is appended (length grows by one). The input
// array is not mutated. Reordering is intentionally out of scope here —
// see chore [014] / sister slice [015].
export function applyEventToCards(cards, record) {
  const card = { id: record.id, status: record.status };
  const idx = cards.findIndex((c) => c.id === record.id);
  if (idx === -1) return [...cards, card];
  const next = cards.slice();
  next[idx] = card;
  return next;
}

function Card({ id, status }) {
  return html`
    <div class="card">
      <div class="card-id">${id}</div>
      <div class="card-status">${status}</div>
    </div>
  `;
}

function Dashboard({ cards }) {
  if (cards.length === 0) {
    return html`<div class="empty-state">No sessions yet.</div>`;
  }
  return html`
    <div class="cards">
      ${cards.map((c) => html`<${Card} id=${c.id} status=${c.status} />`)}
    </div>
  `;
}

export async function mount(rootEl) {
  const res = await fetch("/api/state");
  const records = await res.json();
  let cards = cardsFromState(records);
  render(html`<${Dashboard} cards=${cards} />`, rootEl);

  // Open the live channel. EventSource is a browser primitive; in non-DOM
  // environments (e.g. unit tests of cardsFromState) `mount` isn't called.
  // No custom onerror reconnect policy — recovery is sister slice [016].
  if (typeof EventSource !== "undefined") {
    const source = new EventSource("/events/stream");
    source.onmessage = (event) => {
      const record = JSON.parse(event.data);
      cards = applyEventToCards(cards, record);
      render(html`<${Dashboard} cards=${cards} />`, rootEl);
    };
  }
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
