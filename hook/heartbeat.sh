#!/usr/bin/env bash
# claude-display heartbeat hook.
#
# Reads Claude Code's hook stdin JSON payload, computes a stable per-session id
# from HOSTNAME + (TMUX_PANE | TTY | PPID-$PPID) + cwd, and POSTs an event to
# the local claude-display server. See docs/decisions/0001-heartbeat-stack.md
# for the transport/identity contract and docs/decisions/0002-hook-status-mapping.md
# for the event-name → dashboard-status mapping plus CLAUDE_DISPLAY_STATUS override.
#
# When the stdin JSON's `parent_tool_use_id` field is non-null, the hook is
# firing inside a Task-tool subagent (see docs/decisions/0002). The shell-
# derived id is then the *parent's* id; this hook's own id is derived from
# `(parent_id, parent_tool_use_id)` so each Task invocation gets a stable
# per-invocation subagent id under the same parent.
#
# Resilient: exits 0 if the server is unreachable so a missing server never
# blocks or errors the Claude Code session.

set -u

stdin_payload="$(cat)"

# Extract `cwd`, `parent_tool_use_id`, `hook_event_name`, and `message` from
# the hook's stdin JSON. Bun is the locked runtime dependency for this project,
# so we use `bun -e` rather than taking on `jq`. Each field is read by a
# separate invocation — combining fields into one capture is fragile because
# command substitution strips trailing newlines, which collapses an "absent
# second field" case (and `message` may legitimately contain newlines).
extract_field() {
  local field="$1"
  printf '%s' "$stdin_payload" | bun -e '
    const field = process.argv[1];
    const buf = await Bun.stdin.text();
    let v = "";
    try {
      const obj = JSON.parse(buf);
      if (obj && typeof obj[field] === "string") v = obj[field];
    } catch {}
    process.stdout.write(v);
  ' "$field"
}
# Path-aware extractor for `tool_input.description`. The existing
# `extract_field` only reads top-level string fields, but `tool_input` is a
# nested JSON object on Claude Code's PreToolUse stdin (see ADR for
# pre-registration). This helper parses the stdin payload once, drills into
# `tool_input.description`, and prints the value when it is a string; prints
# the empty string when `tool_input` is missing / not an object, or when
# `description` is missing / not a string. Keeps scope tight rather than
# generalizing `extract_field` itself (per chore [067]'s pattern note).
extract_tool_input_description() {
  printf '%s' "$stdin_payload" | bun -e '
    const buf = await Bun.stdin.text();
    let v = "";
    try {
      const obj = JSON.parse(buf);
      if (obj && typeof obj === "object") {
        const ti = obj.tool_input;
        if (ti && typeof ti === "object" && typeof ti.description === "string") {
          v = ti.description;
        }
      }
    } catch {}
    process.stdout.write(v);
  '
}
cwd="$(extract_field cwd)"
parent_tool_use_id="$(extract_field parent_tool_use_id)"
hook_event_name="$(extract_field hook_event_name)"
message="$(extract_field message)"
tool_name="$(extract_field tool_name)"
tool_use_id="$(extract_field tool_use_id)"
session_id="$(extract_field session_id)"
tool_input_description="$(extract_tool_input_description)"

# Derive the dashboard status (ADR 0002-hook-status-mapping). Order:
#   1. CLAUDE_DISPLAY_STATUS, if set to one of the eight enum values, wins
#      verbatim — except for SessionEnd, which never POSTs (rule 3).
#   2. Otherwise the static map below applies; events not in the map produce
#      no POST and exit 0.
# This `status` is then used as the *top-level* status downstream; the
# subagent branch below special-cases SubagentStop (`status` is already
# "idle" via the static map) but otherwise emits the same derived status.
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

# Lowercased message — used by both the status mapping and the needs
# auto-derivation table (ADR 0003) for case-insensitive `permission` substring
# matching. Computed unconditionally so both downstream branches can read it
# under `set -u`, regardless of whether the status path was reached via the
# override or via the static map.
lower_message="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"

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

# Derive the dashboard `needs` value (ADR 0003-needs-taxonomy-and-authoring-scheme).
# Order, mirroring the locked authoring scheme:
#   1. CLAUDE_DISPLAY_NEEDS, if set to one of the seven enum values, wins
#      verbatim. Any other value (unset/empty/unknown) silently falls through.
#   2. Otherwise, the per-event auto-derivation table applies. Only one row
#      auto-emits a value: Notification whose `message` contains `permission`
#      (case-insensitive) → `approve-tool`. Every other event leaves `needs`
#      empty (override-only).
# Then the attention-state filter gates whether the field is attached at all
# (see the JSON-build step below): the field is only included when `status` is
# one of `approval`, `waiting`, `blocked`. Override has no power to bypass
# this filter.
needs=""
needs_override="${CLAUDE_DISPLAY_NEEDS:-}"
case "$needs_override" in
  approve-tool|answer-question|provide-input|pick-option|confirm-destructive|resolve-conflict|review-diff)
    needs="$needs_override"
    ;;
esac

# Per-event auto-derivation table (ADR 0003). Only fires when the override
# didn't yield a value above. Only one row auto-emits a value:
#   Notification whose `message` contains `permission` (case-insensitive)
#   → approve-tool
# Reuses the same lower_message variable computed for the status mapping
# above (ADR 0002), so a single substring check feeds both fields. Every
# other event lacks a discriminator and remains override-only.
if [ -z "$needs" ] && [ "$hook_event_name" = "Notification" ]; then
  case "$lower_message" in
    *permission*) needs="approve-tool" ;;
  esac
fi

pane_or_tty="${TMUX_PANE:-${TTY:-PPID-$PPID}}"
shell_id_raw="${HOSTNAME}:${pane_or_tty}:${cwd}"
shell_id="$(printf '%s' "$shell_id_raw" | shasum -a 256 | cut -c1-8)"

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

if [ -n "$parent_tool_use_id" ]; then
  # Subagent fire — the shell-derived id is the parent's id; derive a
  # subagent id from `(parent_id, parent_tool_use_id)` per ADR 0002. The
  # subagent payload is minimal (id/id_raw/parent_id/status); the server
  # derives `last_event_at` itself for subagent records.
  parent_id="$shell_id"
  id_raw="${parent_id}:${parent_tool_use_id}"
  id="$(printf '%s' "$id_raw" | shasum -a 256 | cut -c1-8)"
  # SubagentStop hook event signals the subagent has finished — always emit
  # the end-flavored payload (status: "idle") so the server removes the
  # subagent record (ADR 0002 subagent-removal contract from chore [030];
  # not subject to the CLAUDE_DISPLAY_STATUS override). All other subagent
  # fires use the same derived status as a top-level fire (ADR 0002 hook
  # status mapping from chore [021]; per the static map this is typically
  # "working" for PreToolUse/PostToolUse/UserPromptSubmit/PreCompact, with
  # override fall-through honored).
  if [ "$hook_event_name" = "SubagentStop" ]; then
    sub_status="idle"
  else
    sub_status="$status"
  fi
  # Mirror the top-level branch's attention-state filter: `needs` is attached
  # only when the resolved subagent status is one of approval/waiting/blocked
  # (ADR 0003). The override has no power to bypass this filter.
  sub_needs_for_payload=""
  case "$sub_status" in
    approval|waiting|blocked) sub_needs_for_payload="$needs" ;;
  esac
  body="$(bun -e '
    const [id, id_raw, parent_id, status, needs] = process.argv.slice(1);
    const payload = { id, id_raw, parent_id, status };
    if (typeof needs === "string" && needs.length > 0) {
      payload.needs = needs;
    }
    process.stdout.write(JSON.stringify(payload));
  ' "$id" "$id_raw" "$parent_id" "$sub_status" "$sub_needs_for_payload")"
else
  # Top-level fire — capture full card metadata (elapsed-time anchor +
  # aerospace desktop) before building the payload.
  id="$shell_id"
  id_raw="$shell_id_raw"
  # Capture the elapsed-time anchor at fire time as integer milliseconds since
  # the Unix epoch. The hook owns this timestamp so the dashboard never has to
  # derive it later. See docs/decisions/0002-elapsed-time-anchor.md.
  event_at="$(bun -e 'process.stdout.write(String(Date.now()))')"
  # Capture the focused aerospace workspace at fire time (macOS-only WM). If
  # the binary is missing, slow, or errors, the value is empty and the field
  # is omitted from the payload — never a placeholder. The 500ms cap keeps the
  # hook well under its overall ~2s budget even if curl below also times out.
  desktop="$(bun -e '
    if (!Bun.which("aerospace")) { process.exit(0); }
    const proc = Bun.spawn(["aerospace", "list-workspaces", "--focused"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 500);
    const exitCode = await proc.exited;
    clearTimeout(killer);
    if (exitCode !== 0) process.exit(0);
    const out = (await new Response(proc.stdout).text()).trim();
    if (out.length > 0) process.stdout.write(out);
  ')"

  # `needs` is attached only when the resolved status is an attention-state
  # value (`approval` | `waiting` | `blocked`) per ADR 0003. The override has
  # no power to bypass this filter, so we apply it here in shell rather than
  # forwarding raw `needs` and a status flag into the bun JSON-build step.
  needs_for_payload=""
  case "$status" in
    approval|waiting|blocked) needs_for_payload="$needs" ;;
  esac

  # Capture the operator-supplied instance label from the environment. The
  # env var wins verbatim when set to a non-whitespace-only string; otherwise
  # we auto-derive `instance` from the Claude Code session-name file keyed by
  # the stdin payload's `session_id` (chore [081]). All failure modes
  # (missing `~/.claude/sessions/` dir, no matching file, malformed JSON,
  # missing/non-string `name`, no `session_id` on stdin, thrown exception)
  # collapse to the empty string and fall through to the downstream
  # conditional-assign guard (omit the field).
  instance="${CLAUDE_DISPLAY_INSTANCE:-}"
  # Trim-for-emptiness mirrors the `title_override_trimmed` pattern below
  # (lines 286–297): a whitespace-only override falls through to the
  # auto-derive branch rather than winning as an opaque blank string. The
  # env-var override itself, when non-blank, is preserved verbatim (we do
  # NOT reassign `instance` to the trimmed value — only the gate is trimmed).
  instance_override_trimmed="$(printf '%s' "$instance" | tr -d '[:space:]')"
  if [ -z "$instance_override_trimmed" ] && [ -n "$session_id" ]; then
    instance="$(SESSION_ID="$session_id" bun -e '
      const sessionId = process.env.SESSION_ID || "";
      if (sessionId.length === 0) { process.exit(0); }
      const home = process.env.HOME || "";
      if (home.length === 0) { process.exit(0); }
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const dir = path.join(home, ".claude", "sessions");
        let entries;
        try { entries = await fs.readdir(dir); } catch { process.exit(0); }
        for (const name of entries) {
          if (!name.endsWith(".json")) continue;
          try {
            const buf = await fs.readFile(path.join(dir, name), "utf8");
            const obj = JSON.parse(buf);
            if (obj && typeof obj === "object" && obj.sessionId === sessionId) {
              if (typeof obj.name === "string") {
                const trimmed = obj.name.trim();
                if (trimmed.length > 0) {
                  process.stdout.write(trimmed);
                  process.exit(0);
                }
              }
              process.exit(0);
            }
          } catch {}
        }
      } catch {}
    ' 2>/dev/null)"
  fi

  # Derive the per-event card `title` (parent spec [057] / chore [061]).
  # Order, mirroring the locked authoring scheme:
  #   1. CLAUDE_DISPLAY_TITLE, when set to a non-empty AND non-whitespace-only
  #      string, wins verbatim on every event type — including non-Notification
  #      events that have no auto-derivation source. Unlike `needs`, there is
  #      no per-status gate; the override flows through to every top-level
  #      fire. The whitespace-only check is the spec's twist over the existing
  #      `needs` / `desktop` overrides — a whitespace-only override silently
  #      falls through rather than winning as an opaque blank string.
  #   2. Otherwise, the per-event auto-derivation table applies. Only one
  #      row auto-emits a value: Notification whose `message` contains
  #      `permission` (case-insensitive) → the verbatim message (original
  #      case preserved, NOT lower_message). Reuses the same
  #      `lower_message` substring discriminator already feeding the
  #      `needs="approve-tool"` auto-derivation above (ADR 0003) so the two
  #      fields agree without extra logic.
  title=""
  title_override="${CLAUDE_DISPLAY_TITLE:-}"
  # Strip leading/trailing whitespace so a value of e.g. "   " collapses to
  # the empty string and falls through to the auto-derivation branch.
  title_override_trimmed="$(printf '%s' "$title_override" | tr -d '[:space:]')"
  if [ -n "$title_override_trimmed" ]; then
    title="$title_override"
  elif [ "$hook_event_name" = "Notification" ]; then
    case "$lower_message" in
      *permission*) title="$message" ;;
    esac
  fi

  # Capture the CLAUDE_DISPLAY_DETAIL override at fire time. Trim leading and
  # trailing whitespace so a whitespace-only override falls through as if
  # unset (matches the spec's "non-whitespace-only" requirement); the
  # downstream `typeof X === "string" && X.length > 0` guard in the bun -e
  # JSON-build step then drops the empty result. Mirrors the override-only
  # authoring pattern of `instance` (sibling chore [060]); divergence from
  # that precedent is the trim, mirroring `title` (chore [061]).
  detail="${CLAUDE_DISPLAY_DETAIL:-}"
  detail="${detail#"${detail%%[![:space:]]*}"}"
  detail="${detail%"${detail##*[![:space:]]}"}"

  body="$(bun -e '
    const [id, id_raw, status, repo, branch, session_label, desktop, event_at, needs, instance, title, detail] = process.argv.slice(1);
    const payload = { id, id_raw, status, repo, branch, event_at: Number(event_at) };
    if (typeof session_label === "string" && session_label.length > 0) {
      payload.session_label = session_label;
    }
    if (typeof desktop === "string" && desktop.length > 0) {
      payload.desktop = desktop;
    }
    if (typeof needs === "string" && needs.length > 0) {
      payload.needs = needs;
    }
    if (typeof instance === "string" && instance.length > 0) {
      payload.instance = instance;
    }
    if (typeof title === "string" && title.length > 0) {
      payload.title = title;
    }
    if (typeof detail === "string" && detail.length > 0) {
      payload.detail = detail;
    }
    process.stdout.write(JSON.stringify(payload));
  ' "$id" "$id_raw" "$status" "$repo" "$branch" "$session_label" "$desktop" "$event_at" "$needs_for_payload" "$instance" "$title" "$detail")"
fi

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

# Pre-registration POST: parent-side announcement of an upcoming subagent.
# Fires only when this hook fire is the parent's `PreToolUse(Task)` with a
# non-empty (after trim) `tool_input.description` — i.e. the moment Claude
# Code is about to spawn a Task-tool subagent and the description is what
# the dashboard will surface as the subagent's `instance`. The body uses a
# dedicated `kind: "pre-register"` discriminator (chore [067] Decisions
# Locked) so the server can distinguish it from a regular subagent state
# POST. The subagent id derivation matches ADR 0002 — `id_raw =
# "${parent_id}:${tool_use_id}"`, `id = sha256(id_raw)[0:8]` — so the
# subagent's own later hook fires will derive the same id.
# Trim leading/trailing whitespace from the candidate pre-registration
# description ahead of the guarded branch below, so the branch's emptiness
# check folds the three "no useful description" cases into one (absent
# field, empty string, whitespace-only string — chore [067] Decisions
# Locked; pattern mirrored from CLAUDE_DISPLAY_DETAIL above). Computed
# unconditionally so it is in scope under `set -u` regardless of branch.
pre_reg_desc_trimmed="${tool_input_description#"${tool_input_description%%[![:space:]]*}"}"
pre_reg_desc_trimmed="${pre_reg_desc_trimmed%"${pre_reg_desc_trimmed##*[![:space:]]}"}"

if [ -z "$parent_tool_use_id" ] \
    && [ "$hook_event_name" = "PreToolUse" ] \
    && [ "$tool_name" = "Task" ] \
    && [ -n "$pre_reg_desc_trimmed" ]; then
  pre_reg_parent_id="$shell_id"
  pre_reg_id_raw="${pre_reg_parent_id}:${tool_use_id}"
  pre_reg_id="$(printf '%s' "$pre_reg_id_raw" | shasum -a 256 | cut -c1-8)"
  pre_reg_body="$(bun -e '
    const [id, id_raw, parent_id, instance] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({
      id,
      id_raw,
      parent_id,
      instance,
      kind: "pre-register",
    }));
  ' "$pre_reg_id" "$pre_reg_id_raw" "$pre_reg_parent_id" "$pre_reg_desc_trimmed")"
  curl --silent --show-error \
    --max-time 1 --connect-timeout 1 \
    --fail \
    -H 'Content-Type: application/json' \
    -X POST \
    --data "$pre_reg_body" \
    "$url" >/dev/null 2>&1 || true
fi

exit 0
