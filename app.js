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
    <div class="card" style=${"view-transition-name: card-" + id}>
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
  const res = await fetch("/api/state");
  const records = await res.json();
  let cards = cardsFromState(records);
  withReorderTransition(typeof document !== "undefined" ? document : null, () =>
    render(html`<${Dashboard} cards=${cards} />`, rootEl),
  );

  // Open the live channel. EventSource is a browser primitive; in non-DOM
  // environments (e.g. unit tests of cardsFromState) `mount` isn't called.
  // No custom onerror reconnect policy — recovery is sister slice [016].
  if (typeof EventSource !== "undefined") {
    const source = new EventSource("/events/stream");
    source.onmessage = (event) => {
      const record = JSON.parse(event.data);
      cards = applyEventToCards(cards, record);
      withReorderTransition(typeof document !== "undefined" ? document : null, () =>
        render(html`<${Dashboard} cards=${cards} />`, rootEl),
      );
    };
  }
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
