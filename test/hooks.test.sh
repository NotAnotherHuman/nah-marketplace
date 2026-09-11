#!/usr/bin/env bash
#
# The hooks are the only part of this plugin that is not advisory. A prompt rule
# that gets forgotten costs a re-run; a hook that fails OPEN costs someone a
# rejected branch and an afternoon, and says nothing while it happens.
#
# Exit codes, per the Claude Code hook contract:
#   0 = allow, 2 = block (stderr shown to the model), anything else = error,
#   and an error is NOT a block. So "the hook crashed" and "the hook allowed it"
#   look identical from the outside. Every case below asserts the exact code.
#
#   ./test/hooks.test.sh
#
set -uo pipefail
HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../plugins/nah-gamedev/hooks" && pwd)"
pass=0; fail=0

expect() { # $1 hook  $2 expected-exit  $3 payload  $4 label
  printf '%s' "$3" | "$HOOKS/$1" >/dev/null 2>/tmp/nah-hook-err
  local got=$?
  if [ "$got" = "$2" ]; then
    printf '  ✓ %s\n' "$4"; pass=$((pass+1))
  else
    printf '  ✗ %s — expected exit %s, got %s\n      %s\n' \
      "$4" "$2" "$got" "$(head -1 /tmp/nah-hook-err)"; fail=$((fail+1))
  fi
}

w() { printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$1"; }
b() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }

echo
echo "  boundary guard (relative paths)"
expect guard-boundary.sh 0 "$(w packages/yarnjam/src/main.ts)"        "own package is allowed"
expect guard-boundary.sh 0 "$(w packages/yarnjam/public/assets/a.webp)" "own assets are allowed"
expect guard-boundary.sh 2 "$(w packages/hub-app/src/App.tsx)"        "hub-app is blocked"
expect guard-boundary.sh 2 "$(w packages/game-kit/src/HubRuntime.ts)" "game-kit is blocked"
expect guard-boundary.sh 2 "$(w packages/minigames/src/x.ts)"         "minigames are blocked"
expect guard-boundary.sh 2 "$(w packages/rewardflow/src/x.ts)"        "rewardflow is blocked"
expect guard-boundary.sh 2 "$(w packages/sprite-library/art/x.png)"   "sprite-library is blocked"
expect guard-boundary.sh 2 "$(w Documentation/INTEGRATION_CONTRACT.md)" "the contract is blocked"
expect guard-boundary.sh 2 "$(w .claude/agents/qa-visual.md)"         "the agent flow is blocked"
expect guard-boundary.sh 2 "$(w ugc-studio/src/pipeline.js)"          "studio tooling is blocked"
expect guard-boundary.sh 2 "$(w scripts/dev.sh)"                      "studio scripts are blocked"

echo
echo "  boundary guard (absolute paths — the form Claude Code actually sends)"
expect guard-boundary.sh 2 "$(w /tmp/checkout/packages/hub-app/src/App.tsx)" "absolute hub path is blocked"
expect guard-boundary.sh 0 "$(w /tmp/checkout/packages/yarnjam/src/main.ts)" "absolute own path is allowed"

echo
echo "  boundary guard (must not fail open)"
( unset CLAUDE_PROJECT_DIR
  printf '%s' "$(w packages/hub-app/src/App.tsx)" | "$HOOKS/guard-boundary.sh" >/dev/null 2>&1
  [ $? = 2 ] ) \
  && { echo "  ✓ still blocks with CLAUDE_PROJECT_DIR unset"; pass=$((pass+1)); } \
  || { echo "  ✗ FAILS OPEN with CLAUDE_PROJECT_DIR unset"; fail=$((fail+1)); }
expect guard-boundary.sh 0 '{"tool_name":"Write","tool_input":{}}' "a payload with no file_path is allowed through"

echo
echo "  boundary guard (shell writes — the route the model actually took)"
expect guard-boundary.sh 2 "$(b 'echo hello > packages/hub-app/TEST.txt')"        "redirect into the hub is blocked"
expect guard-boundary.sh 2 "$(b 'cat > packages/game-kit/src/x.ts <<EOF')"        "heredoc into game-kit is blocked"
expect guard-boundary.sh 2 "$(b 'sed -i s/a/b/ packages/hub-app/src/App.tsx')"    "sed -i on the hub is blocked"
expect guard-boundary.sh 2 "$(b 'cp art.png packages/sprite-library/art/x.png')"  "cp into the library is blocked"
expect guard-boundary.sh 2 "$(b 'mv old.md Documentation/NEW.md')"                "mv into Documentation is blocked"
expect guard-boundary.sh 2 "$(b 'rm packages/minigames/src/x.ts')"                "rm inside minigames is blocked"
expect guard-boundary.sh 0 "$(b 'cat packages/hub-app/src/App.tsx')"              "READING the hub is allowed"
expect guard-boundary.sh 0 "$(b 'grep -r DEFAULT_GAMES packages/hub-app')"        "searching the hub is allowed"
expect guard-boundary.sh 0 "$(b 'npm run dev:hub')"                               "running the dev server is allowed"
expect guard-boundary.sh 0 "$(b 'echo hi > packages/yarnjam/notes.txt')"          "writing in your own package is allowed"
expect guard-boundary.sh 0 "$(b 'node ugc-studio/scripts/verify-contract.js yarnjam')" "running a studio check is allowed"

echo
echo "  git guard"
expect guard-git.sh 0 "$(b 'git commit -m x')"            "commit is allowed"
expect guard-git.sh 0 "$(b 'git checkout -b ugc/foo')"    "branching to ugc/ is allowed"
expect guard-git.sh 0 "$(b 'git push -u origin ugc/foo')" "pushing your own branch is allowed"
expect guard-git.sh 0 "$(b 'npm run dev:hub')"            "non-git commands pass through"
expect guard-git.sh 2 "$(b 'git checkout main')"          "checkout is blocked"
expect guard-git.sh 2 "$(b 'git switch main')"            "switch is blocked"
expect guard-git.sh 2 "$(b 'git reset --hard HEAD~1')"    "reset --hard is blocked"
expect guard-git.sh 2 "$(b 'git push origin main')"       "pushing main is blocked"

echo
printf '  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" = 0 ]
