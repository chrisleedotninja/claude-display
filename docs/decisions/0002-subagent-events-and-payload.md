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

## Parent-id payload field and subagent identity

- Options considered: (A) `parent_id` derived as `sha256("${HOSTNAME}:${TMUX_PANE:-${TTY:-PPID-$PPID}}:${cwd}")[0:8]` — exactly [011]'s / ADR 0001's derivation, executed in the subagent's process; (B) a separate field carrying Claude Code's `parent_session_id` from stdin and requiring the server to map `session_id → instance id`.
- Chosen: **A** — the parent-id payload field is named `parent_id`, and its derivation is identical to ADR 0001's identity hash. The hook computes it in the subagent's process from the same shell-context inputs ADR 0001 already locks (`HOSTNAME`, `TMUX_PANE`/`TTY`, `cwd`, with `PPID-$PPID` as last-resort fallback when neither `TMUX_PANE` nor `TTY` is set), then takes the 8-char SHA-256 prefix:
  - `parent_id_raw = "${HOSTNAME}:${TMUX_PANE:-${TTY:-PPID-$PPID}}:${cwd}"`
  - `parent_id = sha256(parent_id_raw)[0:8]`
- Subagent's own id (same shape as ADR 0001's top-level identity, keyed off the unique `parent_tool_use_id` from stdin so each Task invocation gets a stable per-invocation id under the same parent):
  - `id_raw = "${parent_id}:${parent_tool_use_id}"`
  - `id = sha256("${parent_id}:${parent_tool_use_id}")[0:8]`
- Rationale: the subagent inherits the parent's terminal context from the same shell — `HOSTNAME`, `TMUX_PANE`/`TTY`, and `cwd` are all unchanged across the Task spawn — so the hash naturally collapses to the parent instance's id without any coordination between the two processes. That satisfies [007]'s mandate that linkage is established at hook-fire time without a server round-trip. (B) couples the subagent to Claude Code's `parent_session_id`, which is per-invocation and changes on parent restart — exactly the pitfall ADR 0001 already rejected for top-level identity. Using `(parent_id, parent_tool_use_id)` as the subagent key gives uniqueness per Task invocation within a parent's lifetime, and the 8-char SHA-256 prefix keeps the server's keying scheme uniform across top-level and subagent records.
