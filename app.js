// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";

const html = htm.bind(h);

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
//
// Order: most-recent-first by `last_event_at` (descending), with `id`
// ascending as the stable tiebreaker. Records whose `last_event_at` is
// missing, null, or 0 sort after every record with a positive timestamp;
// among themselves they remain in `id`-ascending order.
export function cardsFromState(records) {
  return records
    .map((r) => ({
      id: r.id,
      status: r.status,
      last_event_at: r.last_event_at ? r.last_event_at : null,
    }))
    .sort((a, b) => {
      const aHas = a.last_event_at != null && a.last_event_at > 0;
      const bHas = b.last_event_at != null && b.last_event_at > 0;
      if (aHas && bHas) {
        if (b.last_event_at !== a.last_event_at) return b.last_event_at - a.last_event_at;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }
      if (aHas) return -1;
      if (bHas) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
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
      ${cards.map((c) => html`<${Card} key=${c.id} id=${c.id} status=${c.status} />`)}
    </div>
  `;
}

export async function mount(rootEl) {
  const res = await fetch("/api/state");
  const records = await res.json();
  const cards = cardsFromState(records);
  render(html`<${Dashboard} cards=${cards} />`, rootEl);
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
