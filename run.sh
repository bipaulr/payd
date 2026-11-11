#!/usr/bin/env bash
# payD unattended build. Usage: bash run.sh   (RUN_OPTIONAL=1 to include P7, P9)
set -uo pipefail
cd "$(dirname "$0")"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
MAX_TURNS="${MAX_TURNS:-40}"

fail() { echo "STOP: $*" >&2; exit 1; }

# ---- preflight ----
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || fail "claude not found. Install Claude Code first."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not a git repo. Clone your payd repo and unzip here."
[ -f .env ] || fail ".env missing. Copy .env.example to .env and fill it in."
for v in PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYOUT_SMOKE_EMAIL \
         DEMO_VENDOR_EMAIL_1 DEMO_VENDOR_EMAIL_2 DEMO_VENDOR_EMAIL_3 ANTHROPIC_API_KEY; do
  grep -Eq "^${v}=.+" .env || fail "$v is empty in .env"
done
[ -f BLOCKED.md ] && fail "BLOCKED.md exists. Read it, fix the problem, delete it, run again."
mkdir -p logs

# ---- one step ----
run() {  # run <prompt> <model> <effort>
  local p="$1" model="$2" effort="$3"
  if [ -f "logs/$p.done" ]; then echo "== $p already done, skipping"; return 0; fi
  echo "== $p  model=$model effort=$effort  $(date '+%H:%M')"
  local goal="/goal Every instruction in prompts/$p.md is done, and its final check has been run and passed. Prove it by running the commands the final check names and showing their output. If you cannot continue, write BLOCKED.md and stop. Stop after $MAX_TURNS turns."
  "$CLAUDE_BIN" -p "$goal" --model "$model" --effort "$effort" --permission-mode auto 2>&1 | tee "logs/$p.log"
  local rc=${PIPESTATUS[0]}
  git add -A >/dev/null 2>&1
  git commit -q -m "$p" >/dev/null 2>&1 || true
  [ -f BLOCKED.md ] && fail "$p is blocked. Read BLOCKED.md."
  [ "$rc" -eq 0 ] || fail "$p exited with code $rc. See logs/$p.log, then run again to retry."
  touch "logs/$p.done"
}

run P0  opus   xhigh
run P1  sonnet medium
run P2  opus   high
run P3  opus   medium
run P4  opus   high
run P5  sonnet medium
run P6  sonnet medium
[ "${RUN_OPTIONAL:-0}" = "1" ] && run P7 opus high
run P8  sonnet medium
[ "${RUN_OPTIONAL:-0}" = "1" ] && run P9 opus medium
run P10 opus   xhigh
run P11 sonnet medium

echo "All steps finished $(date '+%H:%M'). Read logs/, open the app, then record the video."
