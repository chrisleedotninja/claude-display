# 0002 — Hook-to-status mapping

Status: Accepted (2026-05-09)

Locks how Claude Code hook events map to the eight dashboard statuses, and the authoring scheme the hook script will use to produce a status. Sibling chore [021] (`hook-emits-explicit-status`) cites this document instead of re-deciding.

This decision does **not** change the transport, per-session identity, or `POST /events` body shape locked in `docs/decisions/0001-heartbeat-stack.md`. It only specifies the `status` field's source of truth.

## Authoring scheme — hybrid

The hook script uses a **hybrid** authoring scheme: **auto-derive a dashboard status from the Claude Code hook event name** as the default, with an environment-variable **override** that takes precedence whenever it is set to a valid enum value.

Rationale (summarized from the locked decision in `spec.md`):

- A pure auto-from-event-name scheme leaves four of the eight dashboard statuses unreachable, which would break the parent's validation walk for those statuses.
- A pure explicit-signal scheme has no real-world signal source in v1 — Claude Code itself does not populate any such field on hook stdin.
- The hybrid approach is the only path that ships immediately, exercises the parent's validation walk end to end, and leaves a clean upgrade path for richer auto-classifiers later.
