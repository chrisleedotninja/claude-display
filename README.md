# claude-display

A localhost-only status board for running Claude Code sessions, styled in the Tokyo Night Storm palette. Each session reports its latest status to a Bun server via a hook; the dashboard renders one card per session, drawn from an eight-value status taxonomy with a visually loud treatment for attention states (`approval`, `waiting`, `blocked`) and a "needs from you" tag naming the specific ask. Cards use a three-column rail/body/meta layout with SVG status glyphs, a header strip, and a live stats strip. Per-card narrative fields — operator-supplied instance name, a one-line title (auto-derived from `Notification` permission prompts), and a one-or-two-sentence detail — make a card answer "what is this agent doing or asking for," not just "where is it and what state is it in." Subagents nest under their parent card and carry their own attention-state needs pill; each subagent row's label composes the parent's instance with the subagent's own (auto-derived from the spawning `Task` tool's `description` parameter) as `parent › subagent`, falling back to the bare subagent id when either side is empty. The most-recently-updated card bubbles to the top; older cards dim via an opacity ramp. Live updates arrive over SSE so no manual refresh is needed. A Tweaks panel filters cards by tone group and toggles per-card metadata fields, with selections persisted across reloads. Single-file Bun server, no `node_modules` at runtime, no build step.

## Quickstart

Bring up the server, point two Claude Code sessions at it, and observe two cards on the dashboard. Runtime and transport choices live in [`docs/decisions/0001-heartbeat-stack.md`](docs/decisions/0001-heartbeat-stack.md); this section is procedural only.

Prerequisites: Bun and Claude Code already installed locally. No other tooling, no auth, no external network calls.

1. In shell A (server), from the repo root: `bun run vendor` once after clone, then `bun run start`. The server is now listening on `http://127.0.0.1:7878`.
2. In each of shells B and C (two separate Claude Code sessions, each in its own terminal pane), edit `~/.claude/settings.json` to add the hook block from [Configure the hook in Claude Code](#configure-the-hook-in-claude-code) below, replacing `/ABS/PATH/TO/claude-display` with the absolute path to your checkout.
3. Still in shells B and C, start `claude` in each pane. The hook fires on each lifecycle event (session start, prompt submit, tool use, notification, stop, etc.) and POSTs the corresponding status to the server.
4. Open `http://127.0.0.1:7878/` in a browser. The page connects to the server over SSE on load, so as each Claude Code session starts and fires hooks, its card appears (and reorders to the top on each update) without a manual refresh. You should see two cards, one per session, each showing its 8-character identifier and a status indicator drawn from the eight-value taxonomy (see [`docs/decisions/0002-hook-status-mapping.md`](docs/decisions/0002-hook-status-mapping.md)).
5. Restart one session: in shell B, quit `claude`, then re-run `claude` in the same pane and same `cwd`. The card count is unchanged (still two); shell B's existing card has updated rather than a third card appearing.
6. Quit `claude` in shells B and C and stop the server in shell A with Ctrl-C when done. The whole walkthrough has run on `127.0.0.1` only with no auth or external network calls.

Acceptance checklist (one-to-one with the parent spec [002]):

- [ ] Triggering the configured hook in a Claude Code session produces a card on the dashboard for that session (Step 3 + Step 4 above).
- [ ] Two concurrent Claude Code sessions produce exactly two cards, one per session, never one card flipping between them and never duplicate cards (Step 4).
- [ ] Each card identifies which session it represents via the session's stable 8-character identifier (Step 4).
- [ ] Each card shows a status indicator reflecting the most recent hook event for that session (Step 4).
- [ ] Restarting one session in the same pane and `cwd` updates the existing card rather than creating a third (Step 5).
- [ ] The whole walkthrough runs on localhost (`127.0.0.1`) with no external network calls and no auth (Steps 1–6).

## Validation walkthrough: needs tag

End-to-end confirmation that each of the seven needs categories renders the matching tag with the locked label and per-category visual treatment, plus the two negative cases the parent spec calls out. The authoring scheme behind the seven-value enum is locked in [`docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md`](docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md); this section is procedural only. Every confirmation below is something the operator sees on the dashboard — no internal-state inspection, no `curl`-against-`/api/state`, no console drilling.

Prerequisites: a running server (`bun run start` in shell A) and a browser open at `http://127.0.0.1:7878/`.

In shell B, run the driver script once: `bash hook/needs-walkthrough.sh`. It fires nine cards on the server — one per step below — and prints `step N: …` per fire so script output and dashboard cards line up. The driver invokes the production `hook/heartbeat.sh` (not `curl /events` directly), so each fire exercises the locked authoring-scheme path and the server's allow-list.

Refresh the dashboard once the script finishes. You should see nine cards. Confirm each one by eye:

1. **`approve-tool`** — the card carries the **Approve tool** tag, with its locked icon and the per-category visual treatment.
2. **`answer-question`** — the card carries the **Answer question** tag, with its locked icon and the per-category visual treatment.
3. **`provide-input`** — the card carries the **Provide input** tag, with its locked icon and the per-category visual treatment.
4. **`pick-option`** — the card carries the **Pick option** tag, with its locked icon and the per-category visual treatment.
5. **`confirm-destructive`** — the card carries the **Confirm destructive** tag, with its locked icon and the per-category visual treatment.
6. **`resolve-conflict`** — the card carries the **Resolve conflict** tag, with its locked icon and the per-category visual treatment.
7. **`review-diff`** — the card carries the **Review diff** tag, with its locked icon and the per-category visual treatment.
8. **Negative case 1** — an attention-state card with no `CLAUDE_DISPLAY_NEEDS` set: the card renders with no tag and no placeholder. The space the tag would have occupied is empty; the card layout otherwise matches the seven cards above.
9. **Negative case 2** — a non-attention-state card (resolved status `working`) fired with `CLAUDE_DISPLAY_NEEDS` set: the card renders with no needs tag despite the wire payload requesting one. The hook's attention-state filter strips the field; the server's allow-list is a second guard.

Walkthrough checklist (one-to-one with the nine steps above):

- [ ] The card from step 1 shows the **Approve tool** tag.
- [ ] The card from step 2 shows the **Answer question** tag.
- [ ] The card from step 3 shows the **Provide input** tag.
- [ ] The card from step 4 shows the **Pick option** tag.
- [ ] The card from step 5 shows the **Confirm destructive** tag.
- [ ] The card from step 6 shows the **Resolve conflict** tag.
- [ ] The card from step 7 shows the **Review diff** tag.
- [ ] The card from step 8 (attention-state, no `CLAUDE_DISPLAY_NEEDS`) shows no tag and no placeholder.
- [ ] The card from step 9 (non-attention-state with `CLAUDE_DISPLAY_NEEDS` set) shows no tag.

## Run

```
bun run vendor   # one-shot after clone: copies Preact + htm into vendor/
bun run start
```

Boots the server on `http://127.0.0.1:7878`. Override the port with the `CLAUDE_DISPLAY_PORT` environment variable:

```
CLAUDE_DISPLAY_PORT=9000 bun run start
```

The server binds only to `127.0.0.1` and is not reachable from other hosts.

## Logging

The server tees every runtime log line — startup, one-line per-HTTP-request summaries (`<METHOD> <path> <status>`), and SSE subscriber connect/disconnect — to stdout AND to `/tmp/claude-display.log` (append mode, never truncated across restarts).

Opt into verbose mode to additionally dump the full request payload (method, path, headers, and body) for each incoming HTTP request, including the SSE stream-connect request. Toggle it with either a CLI flag or an env var; the two paths are equivalent:

```
bun run start --verbose
bun run start -v
CLAUDE_DISPLAY_VERBOSE=1 bun run start
```

Without the flag or env var, output is one-line summaries only. Non-JSON and empty bodies render in a safe textual form and never crash the server.

## Dashboard

After `bun run start`, open `http://127.0.0.1:7878/` in a browser. The page renders in the Tokyo Night Storm palette with a header strip (`▍ claude code · mission board` in mono uppercase on the left with the `▍` rule glyph tinted cyan, live `HH:MM` clock on the right) and a stats strip below it showing live counts for Awaiting, Blocked, Active, Done, and Instances. Each session card uses a three-column layout: an 88px tone-colored rail with a 28×28px glyph chip and an uppercase status label; a flex body column showing the instance name, branch, subagent count, relative time, title, detail, and optional needs pill; and a 240px meta column with mono key/value rows for Repo, Tmux, Desk, Elapsed, and At. Status glyphs are inline SVGs with distinct shapes per status (diamond, speech bubble, octagon, spinner, beaker, magnifier, check, dashed circle) and per-status animations (pulse ring, blink, spin, shimmer). Attention and danger cards get a tone-colored box-shadow ring and glow; older cards dim via an opacity ramp (newest at 1.0, oldest at 0.55). When a `needs` value is set, attention-state cards carry a per-category needs pill (see [`docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md`](docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md)). Subagents render as nested rows in a `.ms-group` panel attached below their parent, on a five-column grid (connector | glyph pill | status label | sub-body | sub-meta): `├─`/`└─` connectors, tone-tinted glyph pills, the sub-body holding the `parent.instance › subagent.instance` name plus an optional sub-title, sub-detail, and sub-needs chip, and a right-aligned sub-meta column showing elapsed over relative time. Each subagent row's name slot shows `parent.instance › subagent.instance` when both sides are present, falling back to the bare 8-character subagent id when either side is missing — no free-floating `›` with one side empty. The most-recently-updated card group bubbles to the top. Updates arrive live over SSE — no manual refresh — and the page reconnects automatically if the channel drops. A Tweaks panel (Appearance / Filters / Metadata fields sections) controls the animation toggle, tone-group filters (attention / active / success / neutral), and per-card metadata field visibility, with selections persisted in `localStorage`.

## Endpoints

- `POST /events` — record an event. Body: JSON `{ "id": "<8-char hash>", "id_raw": "<host:pane:cwd>", "status": "<status>", … }`; optional fields include `event_at` (epoch ms), `repo`, `branch`, `session_label`, `desktop`, `instance`, `title`, `detail`, `parent_id` (for subagent events), and `needs` (one of the seven values from ADR 0003, only meaningful on attention-state events; honored on subagent events with the same allow-list). Status values outside the eight-value enum collapse to `idle`; needs values outside the seven-value allow-list drop silently. The narrative string fields (`instance`, `title`, `detail`) are stored verbatim when non-empty strings; empty, absent, or non-string values are silently dropped (no length cap on `detail` — truncation is the dashboard's concern). A second body shape is accepted on the same endpoint: subagent pre-registrations of the form `{ "id", "id_raw", "parent_id", "instance", "kind": "pre-register" }` (no `status`). The server short-circuits on `kind: "pre-register"` before the `status` gate, upserts a subagent record under `parent_id` (creating a placeholder top-level parent under the orphan rule when `parent_id` is unknown), stores `instance` verbatim, and merges it forward when the same subagent's later activity events land without re-sending the field. Empty or non-string `instance` is silently dropped; missing `id` or `parent_id` returns `400`. Responds `202` on success, `400` on missing or malformed required fields.
- `GET /api/state` — read the current set of session records as a JSON array. Empty array when no events have been recorded.
- `GET /events/stream` — Server-Sent Events channel that broadcasts each accepted record as it lands, in insertion order. The dashboard subscribes after its initial `/api/state` fetch.

## Configure the hook in Claude Code

Add the following to your `~/.claude/settings.json` to wire each Claude Code session up to a running `claude-display` server. Replace `/ABS/PATH/TO/claude-display` with the absolute path to your checkout. Each event in the locked mapping (see [`docs/decisions/0002-hook-status-mapping.md`](docs/decisions/0002-hook-status-mapping.md)) gets its own block; `SessionEnd` is intentionally omitted (the decision says no POST):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "PreToolUse": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "PostToolUse": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "PreCompact": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "PermissionRequest": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh" } ] }
    ]
  }
}
```

The hook is an executable `bash` script. On each fire it computes a stable per-session id from `${HOSTNAME}:${TMUX_PANE:-${TTY:-PPID-$PPID}}:${cwd}` (8-char SHA-256 prefix) and POSTs `{ id, id_raw, status }` to the local server, where `status` is drawn from the eight-value taxonomy locked in [`docs/decisions/0002-hook-status-mapping.md`](docs/decisions/0002-hook-status-mapping.md). Two concurrent sessions in different panes get distinct ids; restarting a session in the same pane and `cwd` reuses the same id, so the existing record updates rather than duplicates.

Override the server URL with `CLAUDE_DISPLAY_URL` (defaults to `http://127.0.0.1:7878`):

```
CLAUDE_DISPLAY_URL=http://127.0.0.1:9000 /ABS/PATH/TO/claude-display/hook/heartbeat.sh
```

The hook auto-derives a status from the Claude Code event name. To force one of the eight values explicitly — handy for the four override-only statuses (`tests`, `reviewing`, `success`, `blocked`) — set `CLAUDE_DISPLAY_STATUS`:

```
env CLAUDE_DISPLAY_STATUS=tests claude
```

A valid override wins verbatim over the auto-derivation; an unset, empty, or invalid value silently falls through to auto-derivation. `SessionEnd` never POSTs regardless of the override.

The hook also tags attention-state events with a `needs` category drawn from the seven-value taxonomy locked in [`docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md`](docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md): `approve-tool`, `answer-question`, `provide-input`, `pick-option`, `confirm-destructive`, `resolve-conflict`, `review-diff`. The hook auto-derives `approve-tool` from a `PermissionRequest` event (which fires immediately when Claude Code is about to show an inline permission prompt) and from a `Notification` whose message contains "permission" (case-insensitive — the legacy path, which only fires after Claude Code's idle-notification threshold). Every other category is reachable explicitly via `CLAUDE_DISPLAY_NEEDS`:

```
env CLAUDE_DISPLAY_NEEDS=review-diff CLAUDE_DISPLAY_STATUS=blocked claude
```

A valid `CLAUDE_DISPLAY_NEEDS` wins verbatim over the auto-derivation; an unset, empty, or invalid value silently falls through. The `needs` field is attached only on attention-state events — events whose resolved status is one of `approval`, `waiting`, or `blocked`. On any other status (`working`, `tests`, `reviewing`, `success`, `idle`) the hook emits no `needs` field, even with a valid `CLAUDE_DISPLAY_NEEDS` set. The same attention-state filter and seven-value allow-list also apply to subagent events, so a blocked subagent row carries its own `needs` pill independent of its parent's.

The hook also forwards three optional narrative strings the dashboard renders directly on the card — an instance label, a one-line title, and a one-or-two-sentence detail. `CLAUDE_DISPLAY_INSTANCE` is the operator-supplied per-session display name (e.g. `cc-payments`), distinct from the 8-character session id. `CLAUDE_DISPLAY_TITLE` is a one-line headline of what the agent is doing or asking for; when unset, the hook auto-derives it from a `Notification` whose message contains "permission" (case-insensitive, reusing the same discriminator as `approve-tool`). `CLAUDE_DISPLAY_DETAIL` is a one-or-two-sentence elaboration shown under the title and is override-only (no auto-derivation source). All three follow the same posture as `CLAUDE_DISPLAY_NEEDS`: a valid value wins verbatim, an unset / empty / whitespace-only value silently falls through, and an absent field renders no element on the card (no placeholder):

```
env CLAUDE_DISPLAY_INSTANCE=cc-payments \
    CLAUDE_DISPLAY_TITLE="Approve: rm -rf node_modules" \
    CLAUDE_DISPLAY_DETAIL="Wants to nuke node_modules to resolve a peer-dep conflict in @stripe/react-stripe-js." \
    claude
```

A subagent's `instance` is not env-controlled — `CLAUDE_DISPLAY_INSTANCE` is a top-level-only override (env vars don't propagate per-Task invocation, so a single value would label every subagent the same as its parent). Instead, on each parent `PreToolUse(Task)` the hook reads the Task tool's `description` parameter and POSTs a pre-registration body (`{id, id_raw, parent_id, instance, kind: "pre-register"}`) ahead of the subagent's first fire, deriving the subagent id from `(parent_id, tool_use_id)` per [`docs/decisions/0002-subagent-events-and-payload.md`](docs/decisions/0002-subagent-events-and-payload.md) so the announcement and the subagent's own later events share one id. The dashboard renders the description as the subagent row's name (composed with the parent's instance — see Dashboard above). An empty, missing, or whitespace-only Task `description`, or a `Task` fire that is itself nested inside a subagent (`parent_tool_use_id` non-null), emits no pre-registration; the row falls back to the bare 8-character subagent id.

If the server is not running, the hook exits cleanly within ~1s and never blocks or errors the session.
