# NotAnotherHuman — game dev plugin

The agent flow we use in-house to build the games on the NotAnotherHuman hub,
packaged so you can run it yourself.

You build a **complete, independent game**. We do the hub integration.

## What you need

1. **Claude Code**, with a subscription that covers Opus and Sonnet. A full
   `/nah-gamedev:new-game` run measured around **$12** in practice.
2. **A game starter checkout.** The plugin ships the *flow* — the commands, the
   agents, the guard hooks. It cannot ship the *substrate*: the integration
   contract, `game-kit`, the shared sprite library and the `ugc-studio` scripts
   the commands call.

   **Starters are issued by hand right now**, as a checkout rather than a clone
   URL. Open an issue on this repo saying what you want to build and we will get
   one to you. We hand them to people, not to the internet — that is the only
   gatekeeping there is, and it exists because the substrate is the hub.

Without the starter, `/nah-gamedev:new-game` stops at step 0 and tells you so.

Because starters are hand-issued, yours may have no git remote. That is expected
for now: build on `ugc/<gameId>`, commit, and tell us the branch is ready —
`/nah-gamedev:submit-game` does everything except the push, and we import from your checkout
directly.

## Install

```
/plugin marketplace add NotAnotherHuman/nah-marketplace
/plugin install nah-gamedev@nah
```

Pull improvements later with:

```
/plugin marketplace update nah
```

Updates are pulled, not pushed — nothing changes under you mid-build. Run that
between games, not during one. We improve this flow every time we ship a game,
so the version you get in three months will be better than this one.

## Use

From inside your starter checkout, on a fresh branch:

```
git checkout -b ugc/<gameId>
/nah-gamedev:new-game a game about untangling yarn
```

`/nah-gamedev:new-game` drives the whole pipeline: vision (you're in the loop), architecture,
art selection, a parallel core/juice build, three adversarial QA agents, and a
review gate where you look at real screenshots before anything is called done.

When it's finished:

```
/nah-gamedev:submit-game
```

That checks the boundary, writes `HANDOFF.md` from your game's own files, and
pushes `ugc/<gameId>` for us to pick up.

## The boundary

Your game lives entirely in `packages/<gameId>/`. Everything else — the hub app,
`game-kit`, the shared art library, the contract, CI — is shared state edited
concurrently by other people. A change from you turns a mergeable branch into an
argument, so the plugin's hooks block writes there outright.

If your game genuinely needs something outside its package (a `game-kit` change,
a new bonus game, art the library lacks): **don't make the change.** Write it in
the handoff notes and we'll do it. That path is real — it's how the kit grows.

Check yourself at any time, free and instant:

```
node ugc-studio/scripts/check-boundary.js --doctor   # before you start
node ugc-studio/scripts/check-boundary.js <gameId>   # any time after
```

The hooks also block `git checkout`, `switch`, `stash`, `reset --hard`, pushes to
`main`, and merges. Not paranoia — we've destroyed untracked work that way three
times.

## Art

The shared library holds ~1,150 finished, on-style pieces, and you can use all of
it:

```
./nah art clay block
./nah art --role vfx
```

Selecting beats generating — it's on-brand by construction and costs nothing.
Generate only for a genuine gap, and say which pieces were generated in the
handoff. Art from games that pass visual review gets indexed back into the
library, so the next person starts with more than you did.

## What happens after you submit

We re-run every check on our side rather than trusting yours, read the handoff
against your actual source, and play the game. Then: hub registration, the energy
map entry, share routes and preview cards, the OTA config, asset wiring. None of
that is possible from outside the studio repo, which is why it isn't yours to do.

Then we either merge it, or tell you specifically what's wrong. "Contract-
compliant but not fun" is a real outcome and we will say it plainly.

## Reporting problems

If the flow itself is wrong — an agent produces something weak, the boundary
check misses a case, a rule is missing — that's the interesting bug. Open an
issue. Fixes ship to everyone on the next `/plugin marketplace update`.
