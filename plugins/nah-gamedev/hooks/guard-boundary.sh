#!/usr/bin/env bash
# Refuse writes to studio-owned paths.
#
# The real work is boundary.js next door: deciding what a shell command WRITES
# TO needs more than a substring match. The first version of this refused
#     node ugc-studio/scripts/verify-contract.js <game> > /tmp/out.txt
# which reads a studio script and writes to /tmp, and it did that mid-build. A
# guard that blocks the free checks is worse than no guard.
#
# This wrapper exists for one reason: node might not be on PATH. Then fall back
# to the coarse match — too tight, but never absent.
#
# Exit 2 blocks. Exit 1 does NOT block: Claude Code treats it as a hook error
# and proceeds. So every path here must reach an explicit exit, and a missing
# boundary.js must fall back rather than error.
set -uo pipefail

payload=$(cat)
HERE="$(cd "$(dirname "$0")" && pwd)"

if command -v node >/dev/null 2>&1 && [ -f "$HERE/boundary.js" ]; then
  printf '%s' "$payload" | node "$HERE/boundary.js"
  exit $?
fi

# ---------------------------------------------------------------- fallback
LOG="${NAH_HOOK_LOG-}"
[ -n "$LOG" ] && printf '%s boundary(fallback) %s\n' "$(date +%H:%M:%S)" "$payload" >>"$LOG" 2>/dev/null

file=$(printf '%s' "$payload" \
  | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

PROTECTED="packages/hub-app|the hub is shared by every game and the studio wires yours in
packages/game-kit|the kit is what makes contract compliance structural
packages/rewardflow|reward presentation is hub-owned
packages/minigames|bonus games are shared across the app
packages/sprite-library|the shared art library — add art inside your own package
packages/Sprites|shared art infrastructure
Documentation|the contract is what your game is checked against
.claude|the agent flow itself — improvements come through the plugin
ugc-studio|studio tooling
scripts|studio tooling
.github|CI belongs to the studio"

deny() {
  echo "BLOCKED: $1 is studio-owned — $2" >&2
  echo "Your game lives in packages/<gameId>/. If it genuinely needs this change, put it in the handoff notes and the studio will make it." >&2
  exit 2
}

if [ -n "$file" ]; then
  root="${CLAUDE_PROJECT_DIR:-$PWD}"
  rel="${file#"$root"/}"; rel="${rel#./}"
  case "$rel" in
    packages/hub-app/public/game-assets/*|packages/hub-app/src/ugc.generated.ts) exit 0 ;;
  esac
  while IFS='|' read -r prefix why; do
    [ -z "$prefix" ] && continue
    case "$rel" in "$prefix"/*|*/"$prefix"/*) deny "$rel" "$why" ;; esac
  done <<< "$PROTECTED"
  exit 0
fi

cmd=$(printf '%s' "$payload" \
  | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [ -n "$cmd" ]; then
  case "$cmd" in
    *'>'*|*tee*|*'sed -i'*|*'cp '*|*'mv '*|*'rm '*|*rmdir*|*'touch '*|*'mkdir '*|\
    *'install '*|*'dd '*|*truncate*|*'patch '*|*'git apply'*|*'ln -s'*|*'chmod '*)
      while IFS='|' read -r prefix why; do
        [ -z "$prefix" ] && continue
        case "$cmd" in
          *"$prefix/"*)
            echo "BLOCKED: this command may write into $prefix, which is studio-owned — $why" >&2
            echo "(node or boundary.js was unavailable, so this is the coarse fallback and may be over-strict.)" >&2
            exit 2 ;;
        esac
      done <<< "$PROTECTED"
      ;;
  esac
fi

exit 0
