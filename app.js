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
// repo/branch are carried through when the record supplies them; absent or
// empty values flow through as empty strings, and the renderer omits the
// element entirely rather than substituting a placeholder. (See chore [022] /
// AC2: never `unknown` or `-` for missing repo/branch.)
export function cardsFromState(records) {
  return records.map((r) => ({
    id: r.id,
    status: r.status,
    repo: typeof r.repo === "string" ? r.repo : "",
    branch: typeof r.branch === "string" ? r.branch : "",
  }));
}

function Card({ id, status, repo, branch }) {
  return html`
    <div class="card">
      <div class="card-id">${id}</div>
      ${repo ? html`<div class="card-repo">${repo}</div>` : null}
      ${branch ? html`<div class="card-branch">${branch}</div>` : null}
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
        (c) => html`<${Card} id=${c.id} status=${c.status} repo=${c.repo} branch=${c.branch} />`,
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
