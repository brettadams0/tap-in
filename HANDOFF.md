# Handoff: Tap In, to v1

For the next Claude session. This is the map from where things stand to a finished v1. Read it first, then `SPEC.md` (the source of truth, including the v1 definition of done), `PLAN.md` (phase task lists), `DECISIONS.md` (every recorded choice) and `DESIGN.md` (the look, sound and fun layer).

_Last updated 2026-10-03, end of phase 7 (v1 code complete)._

## 1. Where things stand

- **Phases 1–4 are merged to `main` and deployed. All 11 games are playable** from <https://tap-in-omega.vercel.app>.
  - Phase 1: lobby, rejoin, seat claims, host transfer, clock sync.
  - Phase 2: the session loop, the Drink system (fairness cap), synced audio, **Would You Rather**, **Reaction Shotgun**.
  - Phase 3: **Liar's Prompt**, **Secret Word**, **Two Truths, One App**, **Fake Answer**, the text kit and profanity tiers, "everyone except…" drinks, a first Best liar award.
  - Phase 4: **Rank It**, **Tap Race**, **Spin the Bottle**, **Fill in the Blank**, **Countdown**, and **Reactions**.
  - Phase 5: every prompt bank at its minimum for all three spice levels (strict validator in the build), the skip-prompt flag, Capn's commentary.
  - Phase 6: per-game title moves, the reveal hit, Drink flood variants, Most chaotic and a two-part Fastest thumbs, 🔥 combos, sweating caps, join pops, private sounds an octave lower, easter eggs.
  - Phase 7: chaos, restart and reconnect tests for every game, every game over real sockets, the full 5-phone e2e, visual baselines, bundle and Lighthouse gates in CI, and a fix for a timer race that could freeze a phase (M1).
- **Left for v1:** only the user's real-device sign-off (TESTING.md). Everything else in SPEC's definition of done is ticked.
- **Live room server:** <https://tap-in-server.brettdev.workers.dev> (Cloudflare Worker + Durable Objects, free plan). `GET /healthz` returns `{"ok":true}`.
- **Deploys:** Vercel project `tap-in` (Root Directory `apps/web`) deploys every push to `main`; branches get previews. The server deploys from GitHub Actions.
- **Pipeline (GitHub Actions):**
  - `ci.yml`: lint, format, typecheck, unit + integration + workerd tests, builds (with the content validator), Playwright on WebKit (iPhone 14) + Chromium (Pixel 7) at `TIME_SCALE=0.4`.
  - `deploy-server.yml`: `wrangler deploy` after green CI on `main`, then a `/healthz` smoke test.
  - `e2e-prod.yml`: the whole Playwright suite against the live site with **real timers**, after each server deploy (or **Run workflow**).
- **Production e2e status:** red after phase 4 (the Secret Word test read the step too early); fixed in #5. Check the latest `e2e-prod.yml` run on `main` before starting.
- **Secrets and variables are set** by the user. GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SERVER_URL`. Vercel: `VITE_SERVER_URL`. Never ask the user to paste tokens into chat.
- **Only the user can do:** the real-phone party tests. `TESTING.md` has checklists for phases 1–4; none are ticked yet.

## 2. v1 definition of done (SPEC "Definition of done"), tracked

| Item                                                                             | Status                                                                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| All 11 games playable end to end by 5 phones from one production URL             | Done: the 5-phone e2e plays all 11 locally; production e2e plays every game after each deploy                                           |
| iOS Safari + Android Chrome, no install, no login                                | Built; e2e on WebKit + Chromium in CI and production; **real devices: the user's sign-off**                                             |
| Refresh or lock at any moment rejoins into the correct phase                     | Done: reconnect matrix (every game, mid-input/reveal/Drink), chaos tests, e2e refreshes                                                 |
| No shared screen needed                                                          | Done                                                                                                                                    |
| Every Drink shows only **Drink** and respects the fairness cap                   | Done (validator bans amounts; cap R6/R7; Spin never lands on a capped player)                                                           |
| Every state change animated, key moments have sound, synced sounds land together | Done in phase 6 (title moves, reveal hit, Drink variants, fun layer, join pops, private sounds); sync needs the real-device test (user) |
| Private information never reaches another device                                 | Leak tests for every secret (`deception.test.ts`, reactions, real-socket tests)                                                         |
| Unit, integration and e2e pass in CI; performance budgets met                    | Done: suites green; bundle gate and Lighthouse budgets in CI                                                                            |
| Production live with README, DECISIONS, TESTING, CREDITS, PROGRESS complete      | Done                                                                                                                                    |

## 3. Remaining work, in order

Build in phase order. Each phase is one PR (or a few) and ends deployed, `e2e-prod.yml` green, `PROGRESS.md` updated, new choices in `DECISIONS.md`, and this file updated.

### Phase 5: Content (done)

- Banks: see `PROGRESS.md` for the counts. To add lines, keep each bank's id scheme (`<prefix>-<c|s|u>-NNN`); the build runs `validate-content.ts --strict`, so a short bank, a duplicate, drink wording or an unsafe dare/note fails it.
- Skip-prompt flag: `GameModule.prompt(s)` names the bank entry a round is showing (only in its first input step); the engine counts `flag` messages per prompt, and two re-deal the round from `SessionState.roundBase` (K5–K9). A new banked game should implement `prompt()`.
- Capn's lines: `apps/web/src/play/capn.ts`.

### Phase 6: Polish (done)

- Title moves: `TitleProp` in `play/moments.tsx` plus `.tc-<gameId>` rules in `styles/play.css`. The reveal hit is `RevealHit` in `play/Play.tsx`. The vignette and sweat key off `.urgent-vignette` (rendered by `Timer`).
- Awards: games report `RoundStat` (`reactionMs`, `liarPoints`, `chaos`, `taps`); the engine adds them up in `SessionState`, and `buildResults(players, drinks, games, stats)` ranks them (L1, L2).
- Combos: `SessionState.dry` → `SessionView.dry` → `ComboBadge` on the lock row (L3).
- Still worth doing if time allows: the Fake Answer cards could fan before straightening into a list (they deal in today), and the cap "glance toward whoever just locked in".

### Phase 7: Hardening (done)

- Tests added: `chaos.test.ts` (seeded auto-player from `test/autoplay.ts`, drops, host churn, `Harness.restart()`), `reconnect.test.ts`, `allGames.integration.test.ts`, `testHooks.integration.test.ts`, `e2e/full.spec.ts`, `e2e/visual.spec.ts` (+ `visual.css`, `visual.spec.ts-snapshots/`).
- Test hooks: Node adapter only, `TAPIN_TEST_MODE=1` → `POST /rooms?roundsPerGame=1&timeScale=1` (M4). The page forwards those query params when creating a room.
- CI: `pnpm --filter @tap-in/web size` (bundle gate) and `npx -y @lhci/cli@0.14.0 autorun` (`lighthouserc.json`) in the check job; the e2e job has 35 minutes.
- **What's left is the user's:** the real-device checklist in TESTING.md. Then fix whatever it finds, the same way: a test that reproduces it first.

## 4. How each phase is run (the process that's worked)

1. Start from the latest `main` on a `claude/*` branch. If the branch's PR was already merged, restart the branch from `origin/main`.
2. Before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`, plus the e2e specs you touched (commands in §7). For anything timing-related, also run the e2e once at **real speed** (`E2E_TIME_SCALE=1`), because production e2e runs real timers.
3. Look at the new screens. `E2E_SHOTS=<dir>` makes the deception, phase 4 and reactions specs save screenshots. Readable > playable > fun, and nothing may cover the status or action zones.
4. Small conventional commits. Open a PR (draft first), watch CI (WebKit runs only there), fix anything red, mark ready, merge with a merge commit.
5. After the merge, check the chain on `main`: CI → Deploy room server → **E2E on production**. A red production run is the next task.
6. Update `PROGRESS.md`, `DECISIONS.md` (one line per open choice), `TESTING.md` (a checklist for the phase), `PLAN.md` checkboxes and this file.

## 5. How to add or change a game

1. **Shared types:** view types in `packages/shared/src/games.ts` (pub, me, reveal, input), added to `GameViews`. New drink reasons go in `DrinkReason` (`protocol.ts`) and need copy in `apps/web/src/play/moments.tsx`.
2. **Logic:** `packages/games/src/<gameId>/index.ts` implementing `GameModule` (`packages/games/src/types.ts`).
   - Pure: no `Date`, no `Math.random`. Time, randomness, connected and capped players come in through `GameCtx`. State stays JSON-serialisable.
   - Multi-step rounds use `step()` / `deadline()` / `onTimer()`. An input can move the step on; the engine re-reads `deadline()` after every input. Return `endsEarly: false` for fixed-length synced steps.
   - Secrets live only in state and `privateView`. `result()` returns assigned vs self-inflicted drinkers, an optional `spared` group, and a worst→best ranking for the fairness cap.
   - `rounds(n, length)` and an optional `plannedRounds(s)` when a block can shrink.
3. **Register** in `packages/games/src/registry.ts`, with unit tests beside the module.
4. **Content:** `content/<gameId>.v1.json`, a schema in `packages/games/src/content.ts`, a rule in `BANKS` (`validate.ts`). Add the id to `GAME_IDS` (`settings.ts`) for a new game.
5. **UI:** `apps/web/src/play/games/<Game>.tsx` (input + reveal), wired in `play/Play.tsx`. Typing/voting games reuse `play/typing.tsx`. Styles in `styles/play.css`. Synced sounds come from view timestamps in `audio/cues.ts` (unit-tested); stings in `audio/synth.ts`.
6. **Tests:** engine (`apps/server/test/*.test.ts` with the `Harness`), real sockets (`games.integration.test.ts`), e2e (`apps/web/e2e/`, using `room()` from `helpers.ts`, which switches every other game off).

## 6. Architecture in one breath

- One `RoomEngine` per room (`apps/server/src/engine/engine.ts`) is the single authority. It's host-agnostic: `EngineDeps` injects `now`, `send`, `setAlarm`, `save`, `timeScale`.
- Phases: `lobby → intro → gameIntro → roundInput → roundReveal → drink → (next round | gameOutro) → results`. Overlays (pause, water break, waiting) freeze the phase and shift deadlines on resume.
- Each socket gets its own filtered view; patches are diffs of that view, so a patch can't leak more than a snapshot. Reactions travel outside the view (`reaction` messages, never stored).
- Synced moments ride on view timestamps (`phaseAt`, `flashAt`, `goAt`, `showAt`…) with a 600 ms lead. The phone schedules audio on the AudioContext clock and visuals with rAF.
- Two adapters run the same engine: the Durable Object (`src/worker`, production) and Node `ws` (`src/node`: tests, e2e, dev). `TIME_SCALE` speeds up game timers on the Node adapter only; never the Tap Race window or the Countdown collision window.
- Client: Vite + React SPA. The first load is the lobby; the game screens (`Play`) and reactions are lazy chunks. Zod stays server-side.

## 7. Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test     # all must pass before pushing
pnpm build                                                         # includes the content validator
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e                    # in the Claude cloud sandbox
E2E_TIME_SCALE=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e   # real timers, like production
E2E_SHOTS=/some/dir … npx playwright test e2e/remaining.spec.ts    # save screenshots to review by eye
pnpm --filter @tap-in/server dev     # Node room server on :8787
pnpm --filter @tap-in/web dev        # client on :5173
```

## 8. Gotchas learned the hard way

- **Production e2e runs real timers; CI runs them 2.5× faster.** A test that reads state the instant after an action can pass in CI and fail in production. Wait for the state to change (`expect.poll`), and run timing-sensitive specs once with `E2E_TIME_SCALE=1`.
- **The sandbox proxy blocks WebSockets,** so e2e can't run against the live site from the cloud sandbox; use `e2e-prod.yml`. `curl` works for HTTP checks.
- **WebKit is only in CI.** The sandbox has Chromium only; don't run `playwright install`. Headless WebKit throttles background pages, so `tap()` in `e2e/helpers.ts` calls `bringToFront()` first. `actionTimeout` is 20 s.
- **Nothing may cover the action zone** (DESIGN §0). Notices and the reaction lane sit in the page flow; `.screen` gives up `--react-lane` when the lane follows it (`styles/reactions.css`).
- **A phone that locks counts as disconnected.** The engine ends a step early when nobody connected is still awaited. That's right for votes, wrong for steps a player needs time for (Spin the Bottle's choice and perform steps return `endsEarly: false`, J7).
- **Leak tests read raw frames.** `deception.test.ts` checks every message a phone received. When a test refreshes a phone, keep reading from a phone that wasn't refreshed (the old socket's view goes stale).
- **Emoji render differently by font.** Don't rotate or aim emoji (the bottle was an emoji once and pointed the wrong way); draw it in SVG.
- **Zod 4 `discriminatedUnion`** rejects nested unions and duplicate discriminators: use one object with optional fields and a `refine` (see the `react` schema).
- **ESLint is strict type-checked, with `react-hooks` v6:** no setState in effects, no ref writes in render, no unbound methods (`ctx.ms` must be called as `ctx.ms(…)`, not passed around).
- **`AGENTS.md`** is regenerated by Turborepo; leave it committed. The workerd test config aliases `obscenity` to its CJS entry (I9).
- **Vercel's `VITE_SERVER_URL`** is baked in at build time; changing it needs a redeploy. **Allowed origins** live in `apps/server/wrangler.toml` (`ALLOWED_ORIGINS`); `tap-in-*.vercel.app` previews are allowed when `https://tap-in.vercel.app` is listed.
- **Two flags skip a prompt immediately.** In an e2e, the second flagger's chip goes straight back to "🚩 Skip prompt?" (a fresh prompt); WYR's 15 s vote is only 6 s at `TIME_SCALE=0.4`, too short for two flag sheets, so the flag e2e uses Fill in the Blank.
- **The engine catches up on due timers before every message** (`tick()`). A commit re-arms the single alarm with future deadlines only, so never commit without ticking first, or a late alarm strands the phase (M1).
- **Visual baselines** must be regenerated after an intended visual change: `pnpm --filter @tap-in/web exec playwright test e2e/visual.spec.ts --update-snapshots` (Chromium, in the sandbox with `PW_CHROMIUM_PATH`).
- **Old saved rooms:** new optional state fields (e.g. `liarPoints`, `flags`, `skipped`, `roundBase`, `chaos`, `taps`, `dry`) must tolerate rooms persisted before the change.

## 9. Known issues and small debts

- Countdown's ding plays when the patch arrives, so on other phones it can trail the tap by one network hop.
- Tap Race: refreshing mid-window loses that phone's count (it scores 0 and drinks). Probably fine; revisit if real players complain.
- Reaction rate limits live in memory per room, so a Durable Object restart resets them (J14).
- Visual baselines are Chromium only (M6).
- The phone deals reaction lines from a bundled copy of the pools (J15); the server re-checks every note id and spice.

## 10. The user's standing rules (from the original brief)

- Runs from one link in iOS Safari + Android Chrome. No downloads, no logins, no shared screen.
- The drink instruction is only ever the word **Drink**. No amounts; the validator bans "sip", "shot", "chug".
- Refresh, lock or disconnect always rejoins into the current phase with private info restored.
- The server owns all state and timers; private info never reaches the wrong client.
- All 11 games ship in v1.
- Build in phase order. Each phase ends deployed, tested, committed, with `PROGRESS.md` updated.
- Record every open choice in `DECISIONS.md` with a one-line reason.
- Push back when something hurts fun, performance or reliability.
- **Priority: readable > playable > fun.** Players are in Ontario, Canada: 5 friends in the same room.
- Small conventional commits, keep `main` deployable. Work on a `claude/*` branch, open a PR, get CI green, then merge.

## 11. Prompt to start the next session

> You're continuing the Tap In project (repo: brettadams0/tap-in). Read HANDOFF.md first, then SPEC.md, PLAN.md, DECISIONS.md and DESIGN.md, before doing anything else.
>
> Phases 1–7 are done, merged and deployed (v1 code complete):
>
> - Site: https://tap-in-omega.vercel.app
> - Room server: https://tap-in-server.brettdev.workers.dev
>
> First, confirm the latest "E2E on production" GitHub Actions run on main is green. If it's red, fix it before anything else.
>
> Then help with the real-device sign-off (TESTING.md) and fix whatever it finds, each with a test that reproduces it first.
>
> Work on a claude/\* branch. Run lint, format check, typecheck and tests before every push. One PR per phase: open it, get CI green, merge, then confirm "E2E on production" is green. Record every open choice in DECISIONS.md, and update PROGRESS.md, TESTING.md and HANDOFF.md at the end of each phase.
