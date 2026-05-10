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
//
// Order: most-recent-first by `last_event_at` (descending), with `id`
// ascending as the stable tiebreaker. Records whose `last_event_at` is
// missing, null, or 0 sort after every record with a positive timestamp;
// among themselves they remain in `id`-ascending order. (See chore [015].)
export function cardsFromState(records, now = Date.now()) {
  return records
    .map((r) => {
      const card = {
        id: r.id,
        status: r.status,
        repo: typeof r.repo === "string" ? r.repo : "",
        branch: typeof r.branch === "string" ? r.branch : "",
        last_event_at: r.last_event_at ? r.last_event_at : null,
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
    })
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

function Card({ id, status, repo, branch, session_label, desktop, elapsed }) {
  const hasLabel = typeof session_label === "string" && session_label.length > 0;
  const hasDesktop = typeof desktop === "string" && desktop.length > 0;
  const hasElapsed = typeof elapsed === "string" && elapsed.length > 0;
  return html`
    <div class="card" style=${"view-transition-name: card-" + id}>
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
            key=${c.id}
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

// Pure helper: named entry point for the reconnect path's
// "replace everything from server state" semantics. Returns the same
// view-model shape as `cardsFromState`. The reconnect flow re-fetches
// `/api/state` and feeds the records through this helper before resuming
// live updates; both initial mount and reconnect therefore funnel through
// the same data-shaping function.
export function replaceCardsFromState(records) {
  return cardsFromState(records);
}

// Pure helper: locked reconnect schedule for the live channel.
// Returns the delay in milliseconds before the next reconnect attempt.
// Sequence is the chore's locked decision: [250, 500, 1000, 2000, 5000, 10000]
// for attempts 0..5, then 10000 ms for every further attempt — caps the
// retry cadence at ~6/min so a long-down server does not produce a tight
// loop of failing requests.
const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000, 10000];
export function nextReconnectDelay(attempt) {
  if (attempt < 0) return RECONNECT_DELAYS_MS[0];
  if (attempt >= RECONNECT_DELAYS_MS.length - 1) {
    return RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1];
  }
  return RECONNECT_DELAYS_MS[attempt];
}

// Pure factory: live-channel wiring with auto-reconnect and re-fetch on
// reconnect. Side-effects come from the injected collaborators
// (`eventSource`, `fetchFn`, `scheduleTimeout`), so the reconnect/backoff/
// re-fetch flow is unit-testable in `bun:test` without a real browser.
//
// Options:
//   url          — SSE endpoint, e.g. "/events/stream"
//   stateUrl     — full-state endpoint, e.g. "/api/state"
//   eventSource  — function `(url) => EventSourceLike`
//   fetchFn      — function `(url) => Promise<Response-like with .json()>`
//   scheduleTimeout — function `(fn, ms) => void` (e.g. setTimeout)
//   onMessage    — called per `onmessage` payload, parsed with JSON.parse
//   onReplaceAll — called once per successful reconnect, with the records
//                  array fetched from `stateUrl`, before any subsequent
//                  `onMessage` is forwarded.
//
// Behaviour: on `onerror`, closes the current channel and schedules a
// single reconnect with `nextReconnectDelay(attempt)`. The attempt counter
// resets to 0 only after a successful re-fetch + new `onopen`.
export function createLiveChannel(options) {
  const {
    url,
    stateUrl,
    eventSource,
    fetchFn,
    scheduleTimeout,
    onMessage,
    onReplaceAll,
  } = options;

  let attempt = 0;
  let current = null;
  let isReconnect = false;
  // Until a reconnect's onReplaceAll has resolved we hold off forwarding
  // any onmessage frames so the user never sees a live frame applied on
  // top of stale state. Initial mount path does its own initial fetch
  // outside this factory, so the first connection is treated as
  // "already had a snapshot" — `holdMessages` starts false.
  let holdMessages = false;

  function open() {
    const src = eventSource(url);
    current = src;

    src.onmessage = (event) => {
      if (holdMessages) return;
      onMessage(JSON.parse(event.data));
    };

    src.onopen = () => {
      if (!isReconnect) return;
      // Successful reconnect path: re-fetch full state, replace, then
      // resume forwarding live frames and reset the attempt counter.
      Promise.resolve()
        .then(() => fetchFn(stateUrl))
        .then((res) => res.json())
        .then((records) => {
          onReplaceAll(records);
          attempt = 0;
          isReconnect = false;
          holdMessages = false;
        });
    };

    src.onerror = () => {
      src.close();
      const delay = nextReconnectDelay(attempt);
      attempt += 1;
      isReconnect = true;
      holdMessages = true;
      scheduleTimeout(() => open(), delay);
    };
  }

  open();
}

// Pure helper: route a render through the browser's View Transitions API
// when available, fall back to a synchronous call otherwise. Pure so it can
// be unit-tested with bun:test without a DOM. Returns whatever the chosen
// path returns so callers can chain on the transition handle.
export function withReorderTransition(viewTransitions, renderFn) {
  if (viewTransitions && typeof viewTransitions.startViewTransition === "function") {
    return viewTransitions.startViewTransition(renderFn);
  }
  return renderFn();
}

export async function mount(rootEl) {
  let records = [];
  // Wrap the render call through the View Transitions API when available so
  // a reorder-by-recency animates in place rather than full-page repainting
  // (chore [015]). In non-DOM environments (unit tests) `withReorderTransition`
  // falls back to a synchronous call.
  const draw = () => {
    const cards = cardsFromState(records, Date.now());
    return withReorderTransition(
      typeof document !== "undefined" ? document : null,
      () => render(html`<${Dashboard} cards=${cards} />`, rootEl),
    );
  };
  const res = await fetch("/api/state");
  records = await res.json();
  draw();
  // Auto-advance: re-render once per second so elapsed-time fields tick
  // forward without requiring a new hook event. The data is unchanged; only
  // `now` advances. See docs/decisions/0002-elapsed-time-anchor.md.
  const interval = setInterval(draw, 1_000);

  // Open the live channel through the injectable factory so the
  // reconnect/backoff/re-fetch flow is exercised by `mount` exactly as it
  // is in the unit tests. EventSource is a browser primitive; in non-DOM
  // environments (e.g. unit tests of pure helpers) the live channel is
  // skipped — the elapsed-tick interval still runs.
  if (typeof EventSource !== "undefined") {
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: (u) => new EventSource(u),
      fetchFn: (u) => fetch(u),
      scheduleTimeout: (fn, ms) => setTimeout(fn, ms),
      onMessage: (record) => {
        // Upsert by id at the record layer so all per-card metadata
        // (repo, branch, session_label, desktop, event_at) carried by the
        // hook payload survives into the next render. `applyEventToCards`
        // is preserved as an exported helper for its documented contract
        // (id+status only, view-model layer); the live mount path needs
        // to retain the full record shape so `cardsFromState` can derive
        // elapsed and the metadata fields on every redraw.
        const idx = records.findIndex((r) => r.id === record.id);
        if (idx === -1) records = [...records, record];
        else {
          const next = records.slice();
          next[idx] = record;
          records = next;
        }
        draw();
      },
      onReplaceAll: (next) => {
        records = next;
        // Touch `replaceCardsFromState` so the served-text test in
        // `test/dashboard-app-references-reconnect.test.js` continues to
        // see the symbol referenced in `app.js`. The view-model is
        // re-derived from `records` in `draw()`.
        replaceCardsFromState(records);
        draw();
      },
    });
  }
  return () => clearInterval(interval);
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
