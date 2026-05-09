# claude-display

A localhost-only heartbeat server that records the latest status of each Claude Code session and exposes a state read endpoint. Single-file Bun server, no `node_modules` at runtime, no build step.

## Run

```
bun run start
```

Boots the server on `http://127.0.0.1:7878`. Override the port with the `CLAUDE_DISPLAY_PORT` environment variable:

```
CLAUDE_DISPLAY_PORT=9000 bun run start
```

The server binds only to `127.0.0.1` and is not reachable from other hosts.

## Endpoints

- `POST /events` — record an event. Body: JSON `{ "id": "<8-char hash>", "id_raw": "<host:pane:cwd>", "status": "<status>" }`. The server stores the latest record per `id`. Responds `202` on success, `400` on missing or malformed fields.
- `GET /api/state` — read the current set of session records as a JSON array. Empty array when no events have been recorded.
