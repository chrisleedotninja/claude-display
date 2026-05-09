# 0002 — Subagent hook events and payload

Status: Accepted (2026-05-09)

Locks the contract that lets a subagent's hook event reach the server already attributed to its parent instance: how the hook decides it is firing inside a subagent, which Claude Code hook events carry subagent activity, which event marks a subagent's end, what payload field carries the parent's identifier, how the subagent's own id is derived, and what the server does when a subagent event arrives with a `parent_id` it has never seen. Sibling chores [027]–[030] cite this document instead of re-deciding.

Parent constraints (from [007] PRD): the subagent's payload references the parent instance id at hook-fire time (no server round-trip), a `SubagentStop`-style hook closes the nested card, and a subagent without a known parent must not crash the server.

## Subagent-context detection

- Options considered: (A) check `parent_tool_use_id` from the hook stdin JSON; (B) compare the hook-supplied `session_id` against a parent-recorded `session_id` (requires server round-trip from the hook); (C) require an explicit env var the user sets when invoking subagent-aware hooks.
- Chosen: **A** — the hook decides it is firing inside a subagent when the stdin JSON's `parent_tool_use_id` field is non-null.
- Rationale: `parent_tool_use_id` is the canonical Claude Code marker, present in the hook stdin payload when (and only when) the hook fires from inside a Task-tool subagent. The check is in-process — no server lookup, no extra user configuration. (B) breaks the fire-and-forget hook shape by forcing every hook fire to round-trip through the server before it knows what to emit. (C) double-counts what Claude Code already provides via stdin and adds an environment-variable surface the user has to remember to set.
