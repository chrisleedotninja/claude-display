// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";

const html = htm.bind(h);

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input. `desktop` is included
// only when the record carries a non-empty string — the dashboard never shows
// a placeholder when the value is absent.
export function cardsFromState(records) {
  return records.map((r) => {
    const card = { id: r.id, status: r.status };
    if (typeof r.desktop === "string" && r.desktop.length > 0) {
      card.desktop = r.desktop;
    }
    return card;
  });
}

function Card({ id, status, desktop }) {
  const desktopEl =
    typeof desktop === "string" && desktop.length > 0
      ? html`<div class="card-desktop">${desktop}</div>`
      : null;
  return html`
    <div class="card">
      <div class="card-id">${id}</div>
      ${desktopEl}
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
      ${cards.map(
        (c) => html`<${Card} id=${c.id} status=${c.status} desktop=${c.desktop} />`,
      )}
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
