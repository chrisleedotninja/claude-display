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
// AC2: never `unknown` or `-` for missing repo/branch.) `session_label`,
// `desktop`, and `elapsed` are included only when the record carries a
// non-empty string — the dashboard never shows a placeholder when the value
// is absent.
export function cardsFromState(records, now = Date.now()) {
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
    if (typeof r.desktop === "string" && r.desktop.length > 0) {
      card.desktop = r.desktop;
    }
    if (
      typeof r.event_at === "number" &&
      Number.isFinite(r.event_at) &&
      r.event_at > 0
    ) {
      const delta = now - r.event_at;
      if (delta >= 0) {
        card.elapsed = formatElapsed(delta);
      }
    }
    return card;
  });
}

function Card({ id, status, repo, branch, session_label, desktop, elapsed }) {
  const hasLabel = typeof session_label === "string" && session_label.length > 0;
  const hasDesktop = typeof desktop === "string" && desktop.length > 0;
  const hasElapsed = typeof elapsed === "string" && elapsed.length > 0;
  return html`
    <div class="card">
      <div class="card-id">${id}</div>
      ${repo ? html`<div class="card-repo">${repo}</div>` : null}
      ${branch ? html`<div class="card-branch">${branch}</div>` : null}
      ${hasLabel ? html`<div class="card-session-label">${session_label}</div>` : null}
      ${hasDesktop ? html`<div class="card-desktop">${desktop}</div>` : null}
      ${hasElapsed ? html`<div class="card-elapsed">${elapsed}</div>` : null}
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
            desktop=${c.desktop}
            elapsed=${c.elapsed}
          />`,
      )}
    </div>
  `;
}

export async function mount(rootEl) {
  let records = [];
  const draw = () => {
    const cards = cardsFromState(records, Date.now());
    render(html`<${Dashboard} cards=${cards} />`, rootEl);
  };
  const res = await fetch("/api/state");
  records = await res.json();
  draw();
  // Auto-advance: re-render once per second so elapsed-time fields tick
  // forward without requiring a new hook event. The data is unchanged; only
  // `now` advances. See docs/decisions/0002-elapsed-time-anchor.md.
  const interval = setInterval(draw, 1_000);
  return () => clearInterval(interval);
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
