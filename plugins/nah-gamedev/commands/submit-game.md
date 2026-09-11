---
description: Check the boundary, write the handoff document, and put your finished game on its ugc/ branch for the studio to integrate.
---

Hand a finished game to the studio. Do this yourself — do not delegate it to a subagent, because every step needs a human decision if it fails.

Game: **$ARGUMENTS** (if empty, use the game in `.ugc/current.json`)

## 1. Boundary

```
node ugc-studio/scripts/check-boundary.js <gameId>
```

If it reports files outside `packages/<gameId>/`, **stop**. Show the human the list and the revert command it printed. Do not revert on their behalf without asking — one of those edits may be work they want to keep and move somewhere else.

A branch that edits the hub cannot be merged as-is, and finding that out at intake wastes the studio's time and theirs.

## 2. Contract

```
node ugc-studio/scripts/verify-contract.js <gameId>
```

Must exit 0. This is free, so there is no excuse for submitting with it red.

## 3. Look at the game

Open `.ugc/<gameId>/shots/` and actually look. If there are no shots, `qa-visual` never produced frames and you are submitting something nobody has seen.

Then check the visual QA verdict. An empty or unreadable report is **not** a pass — re-run the gate rather than shipping past it.

## 4. Write the handoff

```
node ugc-studio/scripts/make-handoff.js <gameId>
```

This generates `packages/<gameId>/HANDOFF.md` and `handoff.json` from the game's own files — the registration JSON, the theme, the QA reports. Nothing in it is written from memory.

Read it. Then fill in the **Notes from the developer** section by hand, and be specific:

- anything the game needed that it could not do itself (a `game-kit` change, a new bonus game, a missing asset)
- which art was **generated** rather than selected from the library
- anything you know is weak — a rough edge, an unhandled case, a place you ran out of budget

That last one is worth more than a polished summary. The studio can fix a known weakness; they cannot fix one you hid.

## 5. Pack the evidence so it travels

```
mkdir -p packages/<gameId>/.review
cp -R .ugc/<gameId>/. packages/<gameId>/.review/
```

`.ugc/` is gitignored, so the screenshots and QA reports do not leave this
machine. The studio would receive code with no evidence and have to re-derive
what already happened. Inside the game package they are yours to commit and they
arrive with the game.

## 6. Commit and push

```
git add -A
git commit -m "<gameId>: <one line on what it is>"
git push -u origin ugc/<gameId>
```

You must already be on `ugc/<gameId>`. If you are not, **do not switch branches** — untracked files get destroyed that way. Tell the human and let them sort it out.

If the push is rejected for permissions, stop and tell the human: they need push
access to the starter repo for `ugc/*` branches. Do not invent another remote.

## 7. Tell the human what happens next

The studio takes it from here: hub registration, the energy map entry, share links and preview cards, and the OTA SQL that has to be pasted into Supabase by hand. None of that is theirs to do, and none of it can be done from outside the studio repo.

Report: branch name, contract verdict, visual verdict, screenshot count, and anything in the developer notes.
