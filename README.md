# claude-display

A localhost-only heartbeat server that records the latest status of each Claude Code session and exposes a state read endpoint. Single-file Bun server, no `node_modules` at runtime, no build step.

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

Add the following to your `~/.claude/settings.json` to wire each Claude Code session up to a running `claude-display` server. Replace `/ABS/PATH/TO/claude-display` with the absolute path to your checkout:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/ABS/PATH/TO/claude-display/hook/heartbeat.sh"
          }
        ]
      }
    ]
  }
}
```

The hook is an executable `bash` script. On each `SessionStart` it computes a stable per-session id from `${HOSTNAME}:${TMUX_PANE:-${TTY:-PPID-$PPID}}:${cwd}` (8-char SHA-256 prefix) and POSTs `{ id, id_raw, status: "active" }` to the local server. Two concurrent sessions in different panes get distinct ids; restarting a session in the same pane and `cwd` reuses the same id, so the existing record updates rather than duplicates.

Override the server URL with `CLAUDE_DISPLAY_URL` (defaults to `http://127.0.0.1:7878`):

```
CLAUDE_DISPLAY_URL=http://127.0.0.1:9000 /ABS/PATH/TO/claude-display/hook/heartbeat.sh
```

If the server is not running, the hook exits cleanly within ~1s and never blocks or errors the session.
