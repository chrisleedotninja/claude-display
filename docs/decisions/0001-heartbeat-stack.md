# 0001 — Heartbeat tech stack

Status: Accepted (2026-05-09)

Locks the implementation tech for the heartbeat slice ([002] subtree): server runtime, hook→server transport, per-session identity, frontend approach. Sibling chores [010]–[012] cite this document instead of re-deciding.

Parent constraints (from [002] PRD): localhost-only, near-real-time, single-machine, low-friction setup.

## Server runtime

- Options considered: Bun, Node.js, Python (stdlib `http.server` or FastAPI), Go.
- Chosen: **Bun** — single-file `Bun.serve` script, JavaScript.
- Rationale: ties to the **low-friction** setup constraint. One runtime, one file, no `node_modules`, no build step, sub-100 ms startup. Built-in `Bun.serve` covers HTTP today and SSE/WebSocket when [005] needs them, so the runtime decision doesn't have to be revisited later. Bun is already provisioned on the user's machine via nix-darwin.

## Hook → server transport

- Options considered: HTTP POST, Unix domain socket, raw TCP, WebSocket.
- Chosen: **HTTP POST** — `POST /events`, `Content-Type: application/json`, JSON body.
- Rationale: ties to **low-friction** setup and **localhost**-only operation. Hooks are short-lived subprocesses that fire once and exit — connection-oriented transports (WebSocket, persistent socket) don't fit that lifecycle. POST is trivially driveable from any language a hook script might be written in (`curl`, `bun`, Python `urllib`) and works on localhost with zero setup. `Bun.serve` natively serves HTTP, so this transport composes with the chosen runtime without additional libraries.

## Per-session identity

- Options considered: Claude Code's `session_id` (from hook stdin), `session_id` + `cwd`, composite of shell-context env (`TMUX_PANE`/`TTY` + `cwd` + `hostname`), custom user-set env var.
- Chosen: **composite `hostname:pane_or_tty:cwd`, hashed to an 8-char SHA-256 prefix**. Concretely, the hook computes `id_raw = "${HOSTNAME}:${TMUX_PANE:-${TTY:-PPID-$PPID}}:${cwd}"` and emits both `id_raw` (for human-readable display) and `id = sha256(id_raw)[0:8]` (the stable server key).
- Inputs the hook reads:
  - `HOSTNAME` — inherited from the parent shell.
  - `TMUX_PANE` (preferred) or `TTY` (fallback) — inherited from the parent shell; both are emittable from a bash hook.
  - `cwd` — supplied by the Claude Code hook's stdin JSON payload.
  - `PPID` — last-resort fallback when neither `TMUX_PANE` nor `TTY` is set.
- Rationale: ties to **single-machine**, **localhost** operation — every input is local-only. Parent [002] requires that stopping and restarting `claude` in the same terminal updates the existing card rather than creating a new one. Claude Code's own `session_id` is per-invocation and changes on restart, so it fails that test on its own; the pane/TTY + cwd composite is stable across `claude` restarts in the same terminal context and still distinguishes two concurrent sessions in different panes. The SHA-256 prefix gives a fixed-length opaque key without leaking shell paths into URLs or DOM ids.
