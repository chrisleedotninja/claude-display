#!/usr/bin/env bash
# claude-display needs-tag end-to-end walkthrough driver.
#
# Fires nine cards on a running claude-display server (default
# http://127.0.0.1:7878) so an operator can confirm each of the seven
# locked needs categories renders the matching tag with the locked label and
# per-category visual treatment, plus the two negative cases:
#
#   step 1:  approve-tool        → "Approve tool" tag
#   step 2:  answer-question     → "Answer question" tag
#   step 3:  provide-input       → "Provide input" tag
#   step 4:  pick-option         → "Pick option" tag
#   step 5:  confirm-destructive → "Confirm destructive" tag
#   step 6:  resolve-conflict    → "Resolve conflict" tag
#   step 7:  review-diff         → "Review diff" tag
#   step 8:  attention-state, no CLAUDE_DISPLAY_NEEDS → no tag, no placeholder
#   step 9:  non-attention status with CLAUDE_DISPLAY_NEEDS set → no tag
#
# The driver invokes hook/heartbeat.sh directly with crafted env vars and
# stdin JSON, so every fire goes through the production authoring-scheme
# path locked in docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md
# and the production allow-list path locked by sibling chore [034]. It does
# NOT curl /events directly — that would bypass both layers.
#
# Each step uses a distinct TMUX_PANE-style discriminator so the dashboard
# renders nine distinct cards rather than one card overwriting itself.

set -u

# Resolve heartbeat.sh by the driver's own location so the walkthrough does
# not depend on cwd or PATH.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
heartbeat="${script_dir}/heartbeat.sh"

if [ ! -x "$heartbeat" ]; then
  printf 'needs-walkthrough: cannot find executable %s\n' "$heartbeat" >&2
  exit 1
fi

# Allow override of the target server via CLAUDE_DISPLAY_URL; default mirrors
# heartbeat.sh's default. Exported so heartbeat.sh inherits it from each fire.
export CLAUDE_DISPLAY_URL="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}"

# Stable HOSTNAME so the per-session id derivation is consistent across the
# nine fires (only TMUX_PANE varies between steps to make distinct cards).
export HOSTNAME="${HOSTNAME:-claude-display-walkthrough}"

# fire <step-num> <label> <env-prefix...> -- <stdin-json>
#
# Builds and runs `env <prefix...> heartbeat.sh <<<'<stdin>'`. The label is
# echoed to stdout so the operator can correlate script output with the
# dashboard. The env prefix is given as one argument per VAR=VALUE pair.
fire() {
  local step="$1"
  local label="$2"
  shift 2
  local env_args=()
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--" ]; then
      shift
      break
    fi
    env_args+=("$1")
    shift
  done
  local stdin_json="$1"
  printf 'step %s: %s\n' "$step" "$label"
  env "${env_args[@]}" "$heartbeat" <<<"$stdin_json"
}

# Each step uses a unique TMUX_PANE discriminator and a unique cwd so the
# resolved per-session id is distinct → nine distinct cards on the dashboard.

# Step 1 — approve-tool → "Approve tool" tag.
fire 1 "approve-tool — Approve tool tag" \
  TMUX_PANE='%walkthrough-1' \
  CLAUDE_DISPLAY_STATUS=approval \
  CLAUDE_DISPLAY_NEEDS=approve-tool \
  -- \
  '{"cwd":"/walkthrough/approve-tool","hook_event_name":"PreToolUse"}'

# Step 2 — answer-question → "Answer question" tag.
fire 2 "answer-question — Answer question tag" \
  TMUX_PANE='%walkthrough-2' \
  CLAUDE_DISPLAY_STATUS=waiting \
  CLAUDE_DISPLAY_NEEDS=answer-question \
  -- \
  '{"cwd":"/walkthrough/answer-question","hook_event_name":"PreToolUse"}'

# Step 3 — provide-input → "Provide input" tag.
fire 3 "provide-input — Provide input tag" \
  TMUX_PANE='%walkthrough-3' \
  CLAUDE_DISPLAY_STATUS=waiting \
  CLAUDE_DISPLAY_NEEDS=provide-input \
  -- \
  '{"cwd":"/walkthrough/provide-input","hook_event_name":"PreToolUse"}'

# Step 4 — pick-option → "Pick option" tag.
fire 4 "pick-option — Pick option tag" \
  TMUX_PANE='%walkthrough-4' \
  CLAUDE_DISPLAY_STATUS=waiting \
  CLAUDE_DISPLAY_NEEDS=pick-option \
  -- \
  '{"cwd":"/walkthrough/pick-option","hook_event_name":"PreToolUse"}'

# Step 5 — confirm-destructive → "Confirm destructive" tag.
fire 5 "confirm-destructive — Confirm destructive tag" \
  TMUX_PANE='%walkthrough-5' \
  CLAUDE_DISPLAY_STATUS=approval \
  CLAUDE_DISPLAY_NEEDS=confirm-destructive \
  -- \
  '{"cwd":"/walkthrough/confirm-destructive","hook_event_name":"PreToolUse"}'

# Step 6 — resolve-conflict → "Resolve conflict" tag.
fire 6 "resolve-conflict — Resolve conflict tag" \
  TMUX_PANE='%walkthrough-6' \
  CLAUDE_DISPLAY_STATUS=blocked \
  CLAUDE_DISPLAY_NEEDS=resolve-conflict \
  -- \
  '{"cwd":"/walkthrough/resolve-conflict","hook_event_name":"PreToolUse"}'

# Step 7 — review-diff → "Review diff" tag.
fire 7 "review-diff — Review diff tag" \
  TMUX_PANE='%walkthrough-7' \
  CLAUDE_DISPLAY_STATUS=blocked \
  CLAUDE_DISPLAY_NEEDS=review-diff \
  -- \
  '{"cwd":"/walkthrough/review-diff","hook_event_name":"PreToolUse"}'

# Step 8 — negative case 1: attention-state with no CLAUDE_DISPLAY_NEEDS.
# Resolved status is 'waiting' (Notification + non-permission message). The
# auto-derivation table has no row for this case, and CLAUDE_DISPLAY_NEEDS is
# not set, so the hook emits no needs field. Operator should see a card with
# no tag and no placeholder.
fire 8 "negative case 1 — attention-state with no CLAUDE_DISPLAY_NEEDS → no tag, no placeholder" \
  TMUX_PANE='%walkthrough-8' \
  -- \
  '{"cwd":"/walkthrough/no-needs","hook_event_name":"Notification","message":"Claude is waiting for your input"}'

# Step 9 — negative case 2: non-attention status with CLAUDE_DISPLAY_NEEDS set.
# Resolved status is 'working' (CLAUDE_DISPLAY_STATUS=working overrides the
# static map for PreToolUse). The hook's attention-state filter strips the
# needs field, and the server's allow-list is a second guard. Operator should
# see a card with a working status and no tag.
fire 9 "negative case 2 — non-attention status (working) with CLAUDE_DISPLAY_NEEDS set → no tag" \
  TMUX_PANE='%walkthrough-9' \
  CLAUDE_DISPLAY_STATUS=working \
  CLAUDE_DISPLAY_NEEDS=approve-tool \
  -- \
  '{"cwd":"/walkthrough/non-attention","hook_event_name":"PreToolUse"}'

printf 'needs-walkthrough: nine fires complete. Open %s/ to confirm each card.\n' "$CLAUDE_DISPLAY_URL"
