#!/usr/bin/env bash
# claude-display heartbeat hook.
#
# Reads Claude Code's hook stdin JSON payload, computes a stable per-session id
# from HOSTNAME + (TMUX_PANE | TTY | PPID-$PPID) + cwd, and POSTs an event to
# the local claude-display server. See docs/decisions/0001-heartbeat-stack.md.
#
# Resilient: exits 0 if the server is unreachable so a missing server never
# blocks or errors the Claude Code session.

set -u

stdin_payload="$(cat)"

# Extract `cwd` from the hook's stdin JSON. Bun is the locked runtime
# dependency for this project, so we use `bun -e` rather than taking on `jq`.
cwd="$(printf '%s' "$stdin_payload" | bun -e '
  const buf = await Bun.stdin.text();
  let cwd = "";
  try {
    const obj = JSON.parse(buf);
    if (obj && typeof obj.cwd === "string") cwd = obj.cwd;
  } catch {}
  process.stdout.write(cwd);
')"

pane_or_tty="${TMUX_PANE:-${TTY:-PPID-$PPID}}"
id_raw="${HOSTNAME}:${pane_or_tty}:${cwd}"
id="$(printf '%s' "$id_raw" | shasum -a 256 | cut -c1-8)"

# Derive repo (basename of git toplevel) and branch from cwd. Both are empty
# when cwd is not inside a git repo or git is unavailable — never a placeholder
# like "unknown" (the dashboard renders nothing in that case). git's stderr is
# suppressed so a missing/unhelpful git invocation never noises up the hook.
repo=""
branch=""
if [ -n "$cwd" ]; then
  toplevel="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$toplevel" ]; then
    repo="$(basename "$toplevel")"
    branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    # "HEAD" indicates a detached HEAD without a named ref — emit empty rather
    # than a literal "HEAD" placeholder, consistent with the empty-fallback rule.
    if [ "$branch" = "HEAD" ]; then
      branch=""
    fi
  fi
fi

# Capture a human-readable session label at fire time so the dashboard never
# shells out to tmux/cmux when rendering. Prefer tmux's own `display-message`
# when running inside tmux; fall back to a CMUX_* env hint when not.
session_label=""
if [ -n "${TMUX_PANE:-}" ]; then
  session_label="$(tmux display-message -p -t "$TMUX_PANE" '#S' 2>/dev/null || true)"
elif [ -n "${CMUX_WORKSPACE_NAME:-}" ]; then
  session_label="$CMUX_WORKSPACE_NAME"
fi

url="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}/events"

body="$(bun -e '
  const [id, id_raw, status, repo, branch, session_label] = process.argv.slice(1);
  const payload = { id, id_raw, status, repo, branch };
  if (typeof session_label === "string" && session_label.length > 0) {
    payload.session_label = session_label;
  }
  process.stdout.write(JSON.stringify(payload));
' "$id" "$id_raw" "active" "$repo" "$branch" "$session_label")"

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

exit 0
