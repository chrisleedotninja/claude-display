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

## Override mechanism — `CLAUDE_DISPLAY_STATUS`

The override is a single environment variable named **`CLAUDE_DISPLAY_STATUS`**, validated against the eight-value dashboard-status enum:

- `approval`
- `waiting`
- `blocked`
- `working`
- `tests`
- `reviewing`
- `success`
- `idle`

Implementations of [021] read `CLAUDE_DISPLAY_STATUS` from the hook script's environment and validate it against the enum above. No other override channel (stdin payload field, signal file, etc.) is in scope.

## Hook-event → dashboard-status static map

Default branch of the hybrid scheme. The hook only emits a status — and therefore only POSTs to `/events` — for the rows below. Other Claude Code hook events the script may be wired to fire on, but where the table says "no event emitted", produce no POST.

| Claude Code hook event | Dashboard status | Notes |
|---|---|---|
| `SessionStart` | `idle` | Session just started; the agent is not yet doing work. |
| `UserPromptSubmit` | `working` | User just submitted a prompt; the agent is about to think. |
| `PreToolUse` | `working` | About to invoke a tool. |
| `PostToolUse` | `working` | Tool finished; the agent continues. |
| `PreCompact` | `working` | Compaction is in-progress work. |
| `Notification` (message contains `"permission"`, case-insensitive) | `approval` | Permission prompts are tool-approval moments. |
| `Notification` (any other message) | `waiting` | Default for input prompts, idle nudges, and any message that does not match the permission probe. |
| `Stop` | `idle` | Main turn ended; the event alone carries no "success" semantics. |
| `SubagentStop` | `idle` | Subagent finished. Whether the dashboard collapses or fades a subagent card on `idle` is a frontend rendering concern, not a hook concern. |
| `SessionEnd` | *(no event emitted)* | The card stays at its last status. A future "stale" visual treatment may key off this; out of scope here. |

Rationale (summarized): emitting a status on every wired hook event — including `SessionEnd` — would either churn the card to `idle` for one frame before the terminal closes, or force the dashboard to special-case "ignore this status". Skipping the POST entirely is simpler.
