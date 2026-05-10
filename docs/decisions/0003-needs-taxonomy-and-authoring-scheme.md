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
