# 0002 — Elapsed-time anchor

Status: Accepted (2026-05-09)

Locks the interpretation and wire format of the elapsed-time field on a card
([025] / parent [003]). The parent spec deliberately delegated the choice
between two interpretations to the implementing chore. This ADR records the
pick.

## Interpretations considered

- **Elapsed since session start.** Anchor = first time the dashboard ever saw
  this id. Requires a separate `first_seen_at` field with first-seen-only
  semantics (write once, never overwrite) and persistence reasoning that the
  parent did not lock (what counts as a "session" — process? pane? cwd?).
- **Elapsed since the most recent event.** Anchor = the moment the most
  recent hook fire was sent. Aligns with the existing single-timestamp data
  shape that the prior server-derived `last_event_at` already represented.

## Choice

**Elapsed since the most recent event.** The hook captures the moment it
fires as `event_at`, included in the POST payload alongside the existing
identity / repo / branch / session_label / desktop fields. The server
persists `event_at` on the record as-is; the dashboard renders the elapsed
duration as `now - event_at`, formatted in the largest integer unit that
fits (`Ns`, `Nm`, `Nh`).

## Rationale

- Matches the existing data shape. Each record already carries one timestamp
  per id; the most-recent-event interpretation reuses that slot. The
  session-start interpretation would have required a second timestamp field
  with new "first seen" / "never overwrite" semantics that the parent spec
  did not lock — a deliberate non-introduction.
- Matches the sibling chore pattern. Chores [022]–[024] each add one
  payload field captured at fire time (repo/branch, session_label, desktop);
  `event_at` is the same shape and travels through the same path.
- Replaces, rather than supplements, the prior server-derived
  `last_event_at: Date.now()`. Preserving that field would create a second,
  contradictory anchor and a `_event_at` namespace where two things claim
  to mean "the moment of the most recent event." There is one anchor and
  one name.
- Useful as a "last activity" signal. Most-recent-event ticks forward each
  time the hook re-fires, so a stale card visibly stops advancing. A
  session-start anchor would tick monotonically regardless of whether the
  session was alive.

## Wire format

- Field: `event_at`.
- Type: integer **milliseconds** since the Unix epoch (matches the prior
  server-side `Date.now()` convention).
- Captured in: `hook/heartbeat.sh` at fire time, via `Date.now()` inside a
  `bun -e` one-liner so the timestamp does not depend on the host's `date`
  flag set.
- Validated by: `POST /events` — must be a finite positive number when
  present; rejected with `400` otherwise. Absent is allowed and produces a
  record without `event_at` (the card then renders no elapsed field).
- Returned by: `GET /api/state` as-is on the record.
- Formatted by: the client. `formatElapsed(ms)` in `app.js` produces `Ns` /
  `Nm` / `Nh` flooring within each unit, returning the empty string for
  negative inputs (which the renderer treats as "field omitted").

## Auto-advance

The dashboard re-renders once per second via a `setInterval` in `mount()`,
passing a fresh `Date.now()` to `cardsFromState`. The data is unchanged
between ticks; only `now` advances. This keeps the data-shaping function
pure (it accepts `now` as a parameter) and the only side effect is the
interval registered at mount time.

## Notes for downstream slices

- The legacy `last_event_at` field is removed. No consumer reads it on the
  parent's tip — verified by `grep`. Any future feature that needs a
  per-event timestamp reads `event_at`.
