// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";
import { tokensForStatus, isAttentionStatus } from "./status-tokens.js";

const html = htm.bind(h);

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
export function cardsFromState(records) {
  return records.map((r) => {
    const token = tokensForStatus(r.status);
    return {
      id: r.id,
      status: r.status,
      color: token.color,
      icon: token.icon,
      label: token.label,
    };
  });
}

function Card({ id, status, color, icon, label }) {
  const className = isAttentionStatus(status) ? "card is-attention" : "card";
  return html`
    <div
      class=${className}
      data-status=${status}
      style=${`--card-status-color: ${color}`}
    >
      <div class="card-id">${id}</div>
      <span class="card-status-icon">${icon}</span>
      <div class="card-status">${label}</div>
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
        (c) => html`<${Card}
          id=${c.id}
          status=${c.status}
          color=${c.color}
          icon=${c.icon}
          label=${c.label}
        />`,
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
