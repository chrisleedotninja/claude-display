#!/usr/bin/env bash
# claude-display heartbeat hook.
#
# Reads Claude Code's hook stdin JSON payload, computes a stable per-session id
# from HOSTNAME + (TMUX_PANE | TTY | PPID-$PPID) + cwd, and POSTs an event to
# the local claude-display server. See docs/decisions/0001-heartbeat-stack.md
# for the transport/identity contract and docs/decisions/0002-hook-status-mapping.md
# for the event-name → dashboard-status mapping plus CLAUDE_DISPLAY_STATUS override.
#
# Resilient: exits 0 if the server is unreachable so a missing server never
# blocks or errors the Claude Code session.

set -u

stdin_payload="$(cat)"

# Extract `cwd`, `hook_event_name`, and `message` from the hook's stdin JSON.
# Bun is the locked runtime dependency for this project, so we use `bun -e`
# rather than taking on `jq`. The three values are emitted on three lines so
# bash can read them with a single command (newlines are not legal inside a
# JSON string value, so this is unambiguous for these three fields).
read_fields="$(printf '%s' "$stdin_payload" | bun -e '
  const buf = await Bun.stdin.text();
  let cwd = "", hook_event_name = "", message = "";
  try {
    const obj = JSON.parse(buf);
    if (obj && typeof obj.cwd === "string") cwd = obj.cwd;
    if (obj && typeof obj.hook_event_name === "string") hook_event_name = obj.hook_event_name;
    if (obj && typeof obj.message === "string") message = obj.message;
  } catch {}
  process.stdout.write(cwd + "\n" + hook_event_name + "\n" + message);
')"
cwd="$(printf '%s' "$read_fields" | sed -n '1p')"
hook_event_name="$(printf '%s' "$read_fields" | sed -n '2p')"
message="$(printf '%s' "$read_fields" | sed -n '3,$p')"

# Derive the dashboard status. Order:
#   1. CLAUDE_DISPLAY_STATUS, if set to one of the eight enum values, wins
#      verbatim — except for SessionEnd, which never POSTs (rule 3).
#   2. Otherwise the static map below applies; events not in the map produce
#      no POST and exit 0.
status=""
override="${CLAUDE_DISPLAY_STATUS:-}"
case "$override" in
  approval|waiting|blocked|working|tests|reviewing|success|idle)
    status="$override"
    ;;
esac

# SessionEnd never POSTs, even with a valid override.
if [ "$hook_event_name" = "SessionEnd" ]; then
  exit 0
fi

# Static map fall-through when no valid override is set.
if [ -z "$status" ]; then
  case "$hook_event_name" in
    SessionStart|Stop|SubagentStop)
      status="idle"
      ;;
    UserPromptSubmit|PreToolUse|PostToolUse|PreCompact)
      status="working"
      ;;
    Notification)
      # Case-insensitive substring check for "permission".
      lower_message="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
      case "$lower_message" in
        *permission*) status="approval" ;;
        *) status="waiting" ;;
      esac
      ;;
    *)
      # Event not in the locked map and no override → no POST.
      exit 0
      ;;
  esac
fi

pane_or_tty="${TMUX_PANE:-${TTY:-PPID-$PPID}}"
id_raw="${HOSTNAME}:${pane_or_tty}:${cwd}"
id="$(printf '%s' "$id_raw" | shasum -a 256 | cut -c1-8)"

url="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}/events"

body="$(bun -e '
  const [id, id_raw, status] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ id, id_raw, status }));
' "$id" "$id_raw" "$status")"

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

exit 0
