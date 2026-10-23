#!/bin/bash
# Unattended lecture-to-study-kit run: everything in sources/inbox → one pull request per lecture.
#
#   tools/autopilot-run.sh                 run from the repo's main checkout (where sources/ lives)
#   AUTOPILOT_BUDGET_USD=40 tools/autopilot-run.sh
#
# Claude runs headless in "dontAsk" mode: anything not on the allowlist in .claude/settings.json is denied rather
# than prompted, so the run can never sit waiting for a click. Commits and pushes happen only inside
# `node tools/autopilot.mjs ship` (secret scan, path hygiene). Merging stays manual — that's what publishes.
# The transcript is saved to sources/autopilot-logs/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."

command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 1; }
[ -n "$(ls -A sources/inbox 2>/dev/null | grep -v '^\.')" ] || { echo "sources/inbox is empty — nothing to do"; exit 0; }

mkdir -p sources/autopilot-logs
log="sources/autopilot-logs/$(date +%Y-%m-%d_%H%M%S).log"
prompt='Run the lecture-to-study-kit skill in autopilot mode on everything in sources/inbox.
Read tools/reference/autopilot.md first. Do not ask questions: decide by its policy and record each decision with
`node tools/autopilot.mjs note`. Loop on verify and the content review until every check passes, then ship.
Finish with each PR link, the counts, and anything left open.'

budget=()
[ -n "${AUTOPILOT_BUDGET_USD:-}" ] && budget=(--max-budget-usd "$AUTOPILOT_BUDGET_USD")

echo "autopilot: logging to $log"
claude -p "$prompt" --permission-mode dontAsk ${budget[@]+"${budget[@]}"} 2>&1 | tee "$log"
