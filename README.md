# claude-display

A localhost-only heartbeat server that records the latest status of each Claude Code session and exposes a state read endpoint. Single-file Bun server, no `node_modules` at runtime, no build step.

## Quickstart

Bring up the server, point two Claude Code sessions at it, and observe two cards on the dashboard. Runtime and transport choices live in [`docs/decisions/0001-heartbeat-stack.md`](docs/decisions/0001-heartbeat-stack.md); this section is procedural only.

Prerequisites: Bun and Claude Code already installed locally. No other tooling, no auth, no external network calls.

1. In shell A (server), from the repo root: `bun run vendor` once after clone, then `bun run start`. The server is now listening on `http://127.0.0.1:7878`.
2. In each of shells B and C (two separate Claude Code sessions, each in its own terminal pane), edit `~/.claude/settings.json` to add the hook block from [Configure the hook in Claude Code](#configure-the-hook-in-claude-code) below, replacing `/ABS/PATH/TO/claude-display` with the absolute path to your checkout.
3. Still in shells B and C, start `claude` in each pane. The hook fires on each lifecycle event (session start, prompt submit, tool use, notification, stop, etc.) and POSTs the corresponding status to the server.
4. Open `http://127.0.0.1:7878/` in a browser. Refresh once after starting each Claude Code session. You should see two cards, one per session, each showing its 8-character identifier and a status indicator drawn from the eight-value taxonomy (see [`docs/decisions/0002-hook-status-mapping.md`](docs/decisions/0002-hook-status-mapping.md)).
5. Restart one session: in shell B, quit `claude`, then re-run `claude` in the same pane and same `cwd`. Refresh the dashboard. The card count is unchanged (still two); shell B's existing card has updated rather than a third card appearing.
6. Quit `claude` in shells B and C and stop the server in shell A with Ctrl-C when done. The whole walkthrough has run on `127.0.0.1` only with no auth or external network calls.

Acceptance checklist (one-to-one with the parent spec [002]):

- [ ] Triggering the configured hook in a Claude Code session produces a card on the dashboard for that session (Step 3 + Step 4 above).
- [ ] Two concurrent Claude Code sessions produce exactly two cards, one per session, never one card flipping between them and never duplicate cards (Step 4).
- [ ] Each card identifies which session it represents via the session's stable 8-character identifier (Step 4).
- [ ] Each card shows a status indicator reflecting the most recent hook event for that session (Step 4).
- [ ] Restarting one session in the same pane and `cwd` updates the existing card rather than creating a third (Step 5).
- [ ] The whole walkthrough runs on localhost (`127.0.0.1`) with no external network calls and no auth (Steps 1–6).

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

## Dashboard

After `bun run start`, open `http://127.0.0.1:7878/` in a browser. The page renders one card per recorded session, showing its identifier and most recent status. Refresh the page to pick up new events.

## Endpoints

- `POST /events` — record an event. Body: JSON `{ "id": "<8-char hash>", "id_raw": "<host:pane:cwd>", "status": "<status>" }`. The server stores the latest record per `id`. Responds `202` on success, `400` on missing or malformed fields.
- `GET /api/state` — read the current set of session records as a JSON array. Empty array when no events have been recorded.

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

If the server is not running, the hook exits cleanly within ~1s and never blocks or errors the session.
