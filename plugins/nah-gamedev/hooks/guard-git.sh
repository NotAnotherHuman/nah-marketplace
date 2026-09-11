#!/usr/bin/env bash
# Refuse the git operations that destroy work or bypass review.
#
# `git checkout` in a dirty tree deletes untracked files. That has happened
# three times in this project, each time losing hours. Prompt rules did not
# prevent it; this does.
set -uo pipefail

# Diagnostic breadcrumb. A hook that is registered but never invoked and a
# hook that runs and allows look identical from the outside; this tells them
# apart. Unset NAH_HOOK_LOG to silence it.
LOG="${NAH_HOOK_LOG-}"
payload=$(cat)
[ -n "$LOG" ] && printf '%s HOOK git root=%s %s\n' "$(date +%H:%M:%S)" "${CLAUDE_PROJECT_DIR:-UNSET}" "$(printf %s "$payload" | head -c 200)" >>"$LOG" 2>/dev/null
cmd=$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)
[ -z "$cmd" ] && exit 0

deny() { echo "BLOCKED: $1" >&2; exit 2; }

case "$cmd" in
  *"git checkout"*|*"git switch"*)
    # Creating the game's own branch is the one legitimate case.
    case "$cmd" in
      *"-b ugc/"*|*"checkout -q -b ugc/"*) exit 0 ;;
    esac
    deny "git checkout/switch discards untracked files. Commit first, and let the human change branches." ;;
  *"git stash"*)        deny "git stash has silently lost work here. Commit instead." ;;
  *"git reset --hard"*) deny "reset --hard destroys uncommitted work. Ask the human." ;;
  *"git push"*"main"*)  deny "never push to main — your game goes on ugc/<gameId> and the studio merges." ;;
  *"git merge"*)        deny "the studio merges. Commit on your branch and hand off." ;;
esac
exit 0
