// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";

const html = htm.bind(h);

// Format a duration in milliseconds as a human-friendly string in the
// largest integer unit that fits: `Ns` for [0, 60s), `Nm` for [60s, 60m),
// `Nh` for [60m, ∞). Floors within each unit. Negative inputs render as the
// empty string — the caller expects "field omitted" semantics for the absent
// case (see `cardsFromState` below).
export function formatElapsed(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
//
// repo/branch are carried through when the record supplies them; absent or
// empty values flow through as empty strings, and the renderer omits the
// element entirely rather than substituting a placeholder. (See chore [022] /
// AC2: never `unknown` or `-` for missing repo/branch.)
export function cardsFromState(records) {
  return records.map((r) => {
    const card = {
      id: r.id,
      status: r.status,
      repo: typeof r.repo === "string" ? r.repo : "",
      branch: typeof r.branch === "string" ? r.branch : "",
    };
    if (typeof r.session_label === "string" && r.session_label.length > 0) {
      card.session_label = r.session_label;
    }
    return card;
  });
}

function Card({ id, status, repo, branch, session_label }) {
  const hasLabel = typeof session_label === "string" && session_label.length > 0;
  return html`
    <div class="card">
      <div class="card-id">${id}</div>
      ${repo ? html`<div class="card-repo">${repo}</div>` : null}
      ${branch ? html`<div class="card-branch">${branch}</div>` : null}
      ${hasLabel ? html`<div class="card-session-label">${session_label}</div>` : null}
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
        (c) =>
          html`<${Card}
            id=${c.id}
            status=${c.status}
            repo=${c.repo}
            branch=${c.branch}
            session_label=${c.session_label}
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
