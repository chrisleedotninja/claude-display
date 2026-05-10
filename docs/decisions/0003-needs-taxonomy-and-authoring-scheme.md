# 0003 — Needs taxonomy and authoring scheme

Status: Accepted (2026-05-10)

Locks how the seven `needs` categories from the parent PRD `[006]` are produced by the heartbeat hook integration: the exact wire enum, the authoring scheme that decides which value ships per event, and the override mechanism. Sibling chores [034] (server-side allow-list), [035] (tokens module), [040] (hook-emits-needs), [038] (render-only-on-attention-state), and [041] cite this document instead of re-deciding.

This decision does not change the transport, per-session identity, or `POST /events` body shape locked in `docs/decisions/0001-heartbeat-stack.md`. It does not change the status mapping locked in `docs/decisions/0002-hook-status-mapping.md`; it only specifies the `needs` field's source of truth.

## Wire enum — seven values

The `needs` field on the wire payload is one of exactly seven lowercase, hyphenated string values, drawn verbatim from the parent PRD `[006]`'s "Reference: status taxonomy and 'needs' categories" section:

- `approve-tool`
- `answer-question`
- `provide-input`
- `pick-option`
- `confirm-destructive`
- `resolve-conflict`
- `review-diff`

These strings are the only legal values. Sibling chores [034] (server-side allow-list) and [035] (tokens module) consume these exact strings; any consumer that receives a value outside this set must reject it.

## Authoring scheme — hybrid

Three candidate schemes were considered:

1. **Pure auto-from-stdin.** Derive the `needs` value entirely from the Claude Code hook event name plus stdin substring matching. Rejected: Claude Code emits no discriminating signal for several of the seven categories (e.g., `answer-question` vs `provide-input`), so several enum values would be unreachable in v1.
2. **Pure explicit-signal.** Require an environment variable (or stdin payload field) on every emission. Rejected: this ties every needs tag to outside configuration the user must remember to set, which makes the parent's validation walk fragile and contradicts the precedent established for `status` in `docs/decisions/0002-hook-status-mapping.md`.
3. **Hybrid.** Auto-derive a default `needs` value from the hook stdin where a discriminator exists, and accept an environment-variable override that wins when set to a valid enum value.

**Chosen: hybrid.** This mirrors the precedent set by `docs/decisions/0002-hook-status-mapping.md` for the `status` field, ships immediately (every category is reachable today via the override even where no auto-derivation discriminator exists), and leaves a clean upgrade path for richer auto-classifiers in later slices without a re-decision.

## Override mechanism — `CLAUDE_DISPLAY_NEEDS`

The override is a single environment variable named **`CLAUDE_DISPLAY_NEEDS`**, validated against the seven-value `needs` enum locked above. It parallels `CLAUDE_DISPLAY_STATUS` from `docs/decisions/0002-hook-status-mapping.md` in name, shape, and semantics; no other override channel (stdin payload field, signal file, config file, etc.) is in scope.

Fall-through rules (parallel to the three rules in `0002-hook-status-mapping.md`):

1. **Valid override wins, verbatim.** When `CLAUDE_DISPLAY_NEEDS` is set to exactly one of `approve-tool`, `answer-question`, `provide-input`, `pick-option`, `confirm-destructive`, `resolve-conflict`, or `review-diff`, the hook emits that value as-is on the `needs` field, regardless of which event triggered the emission. The check is exact string match against the seven-value enum; case must match (lowercase).
2. **Unset, empty, or invalid → fall through to auto-derivation.** When `CLAUDE_DISPLAY_NEEDS` is unset, set to the empty string, or set to any string outside the seven-value enum, the hook ignores it and falls through to the per-event auto-derivation table below. **No error is raised**; the variable is treated as if not set. This matches the silent-fall-through behavior locked for `CLAUDE_DISPLAY_STATUS`.
3. **Status filter still applies.** Even a valid `CLAUDE_DISPLAY_NEEDS` value does not cause the hook to attach a `needs` field on a non-attention-state event; see "Status interaction" below. The override has no power to bypass that filter.

## Per-event auto-derivation table

Default branch of the hybrid scheme. The table below covers every Claude Code hook event the heartbeat hook is wired to per `docs/decisions/0002-hook-status-mapping.md`'s table. Only one row carries an auto-derived `needs` value in v1; every other row says explicitly that no needs value is auto-emitted, which means the only way `needs` ends up on the wire for those events is via a valid `CLAUDE_DISPLAY_NEEDS` override (subject to the status filter below).

| Claude Code hook event | Auto-derived `needs` value | Discriminator |
|---|---|---|
| `SessionStart` | *(no needs value is auto-emitted)* | — |
| `UserPromptSubmit` | *(no needs value is auto-emitted)* | — |
| `PreToolUse` | *(no needs value is auto-emitted)* | — |
| `PostToolUse` | *(no needs value is auto-emitted)* | — |
| `PreCompact` | *(no needs value is auto-emitted)* | — |
| `Notification` (stdin `message` contains `permission`, case-insensitive) | `approve-tool` | `message` substring `permission` (case-insensitive), matching the `approval`-status discriminator from `0002-hook-status-mapping.md` |
| `Notification` (any other message) | *(no needs value is auto-emitted)* | — |
| `Stop` | *(no needs value is auto-emitted)* | — |
| `SubagentStop` | *(no needs value is auto-emitted)* | — |
| `SessionEnd` | *(no needs value is auto-emitted)* | — |

Rationale: the `Notification`-with-`permission` row reuses the discriminator already locked for the `approval` status, so the two fields agree without extra logic. Every other event lacks a discriminator that can pick among the seven enum values without false positives, so v1 leaves them override-only. The parent's validation walk for the remaining six categories is satisfied via `CLAUDE_DISPLAY_NEEDS`, which is acceptable per the spec's locked decision.

## Status interaction — attention-state-only

The `needs` field is meaningful only on attention-state events. The hook attaches a `needs` field to a `POST /events` body **only when the event's `status` is one of the three attention-state values**: `approval`, `waiting`, or `blocked`. On any other status — `working`, `tests`, `reviewing`, `success`, or `idle` — the hook **does not emit a `needs` field**, even if `CLAUDE_DISPLAY_NEEDS` is set to a valid enum value. The override has no power to attach `needs` to a non-attention-state event.

This is the single source of truth that sibling chores [034] (server-side allow-list, which stores `needs` verbatim only when status is one of the three attention states) and [038] (frontend render-only-on-attention-state rule) cite. Together with the override fall-through rules above, the hook's emission of `needs` is fully determined by:

1. Is the event's `status` one of `approval`, `waiting`, or `blocked`? If not, the hook emits no `needs` field.
2. Otherwise, is `CLAUDE_DISPLAY_NEEDS` set to a value in the seven-string enum? If yes, emit it verbatim.
3. Otherwise, look up the event in the per-event auto-derivation table above. If a row produces a value, emit it; if the row says no needs value is auto-emitted, emit no `needs` field.
