# 0002 — Subagent hook events and payload

Status: Accepted (2026-05-09)

Locks the contract that lets a subagent's hook event reach the server already attributed to its parent instance: how the hook decides it is firing inside a subagent, which Claude Code hook events carry subagent activity, which event marks a subagent's end, what payload field carries the parent's identifier, how the subagent's own id is derived, and what the server does when a subagent event arrives with a `parent_id` it has never seen. Sibling chores [027]–[030] cite this document instead of re-deciding.

Parent constraints (from [007] PRD): the subagent's payload references the parent instance id at hook-fire time (no server round-trip), a `SubagentStop`-style hook closes the nested card, and a subagent without a known parent must not crash the server.

## Subagent-context detection

- Options considered: (A) check `parent_tool_use_id` from the hook stdin JSON; (B) compare the hook-supplied `session_id` against a parent-recorded `session_id` (requires server round-trip from the hook); (C) require an explicit env var the user sets when invoking subagent-aware hooks.
- Chosen: **A** — the hook decides it is firing inside a subagent when the stdin JSON's `parent_tool_use_id` field is non-null.
- Rationale: `parent_tool_use_id` is the canonical Claude Code marker, present in the hook stdin payload when (and only when) the hook fires from inside a Task-tool subagent. The check is in-process — no server lookup, no extra user configuration. (B) breaks the fire-and-forget hook shape by forcing every hook fire to round-trip through the server before it knows what to emit. (C) double-counts what Claude Code already provides via stdin and adds an environment-variable surface the user has to remember to set.

## Activity event set

- Options considered: (A) reuse the [020] activity event set, with subagent context detected per fire; (B) restrict to a smaller subset (e.g., only `PostToolUse`) to reduce nested-card noise; (C) introduce a synthetic "subagent_active" event driven by the parent's `PreToolUse` for `tool=Task`.
- Chosen: **A** — the subagent activity events are the same set as [020]'s top-level mapping. The dashboard's activity-event taxonomy applies uniformly to top-level and subagent events; the subagent context is detected per fire (per the rule above), not by changing which events fire.
- Rationale: parent [007] requires the subagent's nested card to surface activity the user would want to see, and the dashboard's status taxonomy is identical for subagents and top-level instances — so the event set is identical. (B) silently drops visibility users have already opted into via [020]. (C) loses real subagent event timing, because `PreToolUse` for `tool=Task` fires once at spawn, not on each subagent activity.

## End event

- Options considered: (A) `SubagentStop`; (B) infer end from a timeout on subagent activity; (C) treat the main-agent `Stop` hook as removal of all of its subagents.
- Chosen: **A** — `SubagentStop` is the Claude Code hook event that marks a subagent as finished. When a subagent stops, the hook fires once with `parent_tool_use_id` non-null and the same identity-derivation rule used for activity events; the server treats it as the close signal for the corresponding nested card.
- Rationale: `SubagentStop` is the explicit, dedicated Claude Code hook semantically aligned with the subagent lifecycle — picking it gives a deterministic close signal at the exact moment Claude Code already knows the subagent is done. (B) needs a server-side timer per subagent, adds latency before close, and produces false negatives when a real subagent legitimately runs longer than the chosen window. (C) is wrong on the timing axis: subagents typically finish well before their main-agent parent does, so deferring close until the parent's `Stop` would leave nested cards visibly stale for the bulk of normal use.
