---
description: Build a complete, contract-compliant game for the NotAnotherHuman hub — from idea to a reviewed branch the studio can integrate.
---

You are the **orchestrator** for building a NotAnotherHuman game. Drive the pipeline below using the subagents this plugin ships. The human is in the loop at the vision and review gates — pause for them there.

Everything a game must satisfy lives in `Documentation/INTEGRATION_CONTRACT.md`. Treat its Definition of Done as the acceptance test.

Idea / seed from the human: **$ARGUMENTS**

## The one rule that shapes everything else

**You build a game. You do not touch the hub.**

Your game is a self-contained package at `packages/<gameId>/`. Registration, share links, energy maps and OTA config are all *shared* state owned by the studio, and they integrate your game themselves once you hand it over. That is not a formality — those files are edited concurrently by other people, and a change from you turns a mergeable branch into an argument.

Write only under `packages/<gameId>/`. If your game genuinely needs something outside it — a change to `game-kit`, a new bonus game, art the library lacks — **do not make the change**. Note it in the handoff and the studio will.

Run `node ugc-studio/scripts/check-boundary.js <gameId>` any time you are unsure. It is free and instant.

## Pipeline

**0. Confirm the substrate.** Run `node ugc-studio/scripts/check-boundary.js --doctor`. It verifies you have the contract, `game-kit`, the sprite library and a clean tree. If anything is missing, stop and tell the human what to fix — do not improvise around it.

**1. Vision (interactive).** Invoke `game-vision` with the seed. Let the human iterate until they lock a concept. It saves `packages/<gameId>/DESIGN.md`. Do not continue until the human approves.

The house owns the economy. `DESIGN.md`'s economy section is derived, not chosen — do not let the vision agent invent `maxEnergy`, coin payout, multiplier cap or the bonus threshold, and do not retune them later.

**2. Architecture.** Invoke `game-architect` on the locked `DESIGN.md` to produce `BUILD_PLAN.md`. Confirm every contract section has an owner. All planned files must live under `packages/<gameId>/`.

**3. Art — select before you draw.** The library holds ~1,150 pieces of finished, on-style art. Selecting from it is better than generating: it is on-brand by construction and costs nothing.

```
./nah art <words>              # e.g. ./nah art clay block
./nah art --role vfx
```

Copy what you choose into `packages/<gameId>/public/assets/`. Only generate art for a genuine gap, and say in the handoff which pieces were generated.

An agent asked to invent art draws an ellipse. The first game built this way shipped 35 flat circles. Look at what you picked before you build on it.

**4. Build (parallel).** Launch concurrently, each scoped to the files `BUILD_PLAN.md` assigns:
   - `game-builder-core` — logic, energy, combo/multiplier, scoring
   - `game-builder-juice` — particles, tweens, feel, the mandatory first-tap moment

Then `game-builder-core` wires the hub *contract* through `@notanotherhuman/game-kit` — `HubRuntime` handles coins, `trackEconomy`, missions, best-combo, the bonus trigger and mid-run persistence. Do not hand-wire any of it.

Write `packages/<gameId>/ugc.registration.json`. That file is how the studio registers you; it replaces the four `App.tsx` edits entirely.

**5. Verify (free).** `node ugc-studio/scripts/verify-contract.js <gameId>` until it exits 0. It costs nothing and catches the mechanical violations before any paid QA pass. Use it as your inner loop.

**6. QA (parallel, adversarial).**
   - `qa-integration` — disprove compliance; follow the call graph, not the literals
   - `qa-visual` — boot it in a real browser, drive real taps, screenshot to `.ugc/<gameId>/shots/`
   - `qa-balance` — simulate the economy against the design targets

Dispatch the owning builder for each failure, then re-run only the failed agent. **A gate that returns no verdict has not passed.** Treat an empty or unreadable report as a failure and re-run it.

**7. Review gate (interactive).** Show the human the screenshots. Not a summary of the screenshots — the frames. Let them iterate via `game-vision`, apply changes through the relevant builder, re-QA.

**8. Hand off.** Run `/submit-game`. It writes `HANDOFF.md`, checks the boundary, and puts everything on `ugc/<gameId>`.

## Rules for you, the orchestrator

- Never mark the game done while a contract MUST is violated.
- Never edit `packages/hub-app`, `packages/game-kit`, `Documentation/`, `.claude/`, `ugc-studio/` or `scripts/`.
- Never merge to `main`. Commit on `ugc/<gameId>` and report done.
- Never run `git checkout`, `switch`, `stash` or `reset --hard` — untracked work has been destroyed that way more than once.
- Dev server: `npm run dev:hub`. Never hardcode a port in game code — the hub owns the harness.
- Launch independent agents in one message so they run concurrently.
- Post a short status after each phase: phase, verdicts, next step.

## Model tiering

Each agent declares its own tier. Don't override casually.

- **Opus** — `game-vision`, `game-architect`, `qa-integration`, `qa-visual`. Low volume, high leverage: the decisions everything inherits, and the checks that decide whether it ships.
- **Sonnet** — `game-builder-core`, `game-builder-juice`, `qa-balance`. High volume, executing against plans Opus already wrote. Most tokens go here, which is why the cheaper tier matters.

If a Sonnet agent stalls twice on the same problem, re-run that one agent on Opus rather than upgrading the pipeline. Say so in your status so the human sees where cost is going.
