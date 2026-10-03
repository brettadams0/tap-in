# Handoff: Tap In

For the next Claude session. Read this first, then `SPEC.md` (the source of truth), `PLAN.md` (phase task lists) and `DECISIONS.md`.

_Last updated 2026-10-03, end of phase 4._

## Where things stand

- **Phases 1–4 are code-complete and merged to `main`. All 11 games are playable.**
  - Phase 1: lobby, rejoin, seat claims, clock sync.
  - Phase 2: the session loop, the Drink system, audio, and two games: **Would You Rather** and **Reaction Shotgun**.
  - Phase 3: the deception games **Liar's Prompt**, **Secret Word**, **Two Truths, One App** and **Fake Answer**, the text kit (`packages/games/src/kit/`), profanity tiers, the "everyone except…" Drink moment and a first Best liar award.
  - Phase 4: **Rank It**, **Tap Race**, **Spin the Bottle**, **Fill in the Blank**, **Countdown**, and **Reactions** (`@tap-in/shared/reactions`, `apps/web/src/play/reactions.tsx`).
- **Live site:** <https://tap-in-omega.vercel.app>. Vercel project `tap-in`, Root Directory `apps/web`. Every push to `main` deploys; branches get previews.
- **Live room server:** <https://tap-in-server.brettdev.workers.dev>. A Cloudflare Worker with Durable Objects, free plan. `GET /healthz` returns `{"ok":true}`.
- **Deploy pipeline (GitHub Actions):**
  - `ci.yml` runs lint, typecheck, unit + integration + workerd tests, builds, and Playwright e2e on WebKit (iPhone 14) + Chromium (Pixel 7).
  - `deploy-server.yml` runs `wrangler deploy` after green CI on `main`, then a `/healthz` smoke test against `vars.SERVER_URL`.
  - `e2e-prod.yml` runs the full Playwright suite against the live site after each server deploy, or by hand via **Run workflow**. It reads `vars.SITE_URL` (default `https://tap-in-omega.vercel.app`).
- **Secrets and variables are already set** by the user. GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SERVER_URL`. Vercel: `VITE_SERVER_URL`. Never ask the user to paste tokens into chat.
- **Not done yet:**
  - The first **real-phone party test**: `TESTING.md` has the phase 1–4 checklists. Only the user can do it.
- `e2e-prod.yml` went green on its first run (2026-10-02, after deploy #2).

## Next work: phase 5, content (PLAN.md §9)

1. **Banks to their minimums, per spice level** (R2): Would You Rather 60, Rank It 30, Liar's Prompt 40, Two Truths 80, Secret Word 80, Fake Answer 50, Spin the Bottle 40, Fill in the Blank 60. Reaction pools: 40+ per tab. Then run the validator with `--strict` in the build (`packages/games/package.json`).
2. **Stranger-safety review** of every line (SPEC "Content"). The validator already blocks drink amounts, unsafe dares and appearance/contact lines in reactions; the rest is a read-through. Fake Answer trivia must be true: only add facts you're sure of.
3. **Skip-prompt flag:** a small flag on prompt screens; 2 flags in a session auto-skip that prompt and log `{bankId, promptId}` (R17).
4. Capn commentary lines (DESIGN §8) can share the reaction lane when it's empty.

Phases 6–7 (polish, hardening) are in `PLAN.md`.

## How to add a game (the established pattern)

1. **Shared types:** add view types to `packages/shared/src/games.ts`: pub, me, reveal and input per game. Then add the game to `GameViews` (that union drives `PlayView`).
2. **Logic:** write `packages/games/src/<gameId>/index.ts` implementing `GameModule` (`packages/games/src/types.ts`). The engine never imports a game directly.
   - Games are pure: no `Date`, no `Math.random`. Time and randomness come in through `GameCtx`.
   - Game state must stay JSON-serialisable.
   - Multi-step rounds expose `step()` / `deadline()` / `onTimer()`.
   - Secrets live only in state and `privateView`.
   - `result()` returns assigned vs self-inflicted drinkers, plus a worst→best ranking for the fairness cap.
3. **Register** the game in `packages/games/src/registry.ts`, with unit tests beside it (see `wouldYouRather.test.ts`, `reactionShotgun.test.ts`).
4. **Content:** add `content/<gameId>.v1.json` (spice-tagged). Add its schema to `content.ts` and a rule to `BANKS` in `validate.ts`; the validator runs in `pnpm build`.
5. **UI:** write `apps/web/src/play/games/<Game>.tsx` (input + reveal) and wire it in `play/Play.tsx`. Typing and voting games reuse `play/typing.tsx` (`TextEntry` shows the server's rejection under the box, `PlayerPick`, `useVote`, `Bubbles`). Styles go in `apps/web/src/styles/play.css`. Synced sounds come from view timestamps in `apps/web/src/audio/cues.ts`, which has unit tests.
6. **Tests:** add an engine session test (`apps/server/test/session.test.ts`), a real-socket test (`apps/server/test/games.integration.test.ts`) and an e2e (`apps/web/e2e/game.spec.ts`).

## Architecture in one breath

- The `RoomEngine` (`apps/server/src/engine/engine.ts`) is the single authority per room. It is host-agnostic: `EngineDeps` injects `now`, `send`, `setAlarm`, `save`, `timeScale`.
- Phases run `lobby → intro → gameIntro → roundInput → roundReveal → drink → (next round | gameOutro) → results`.
- Overlays (pause / water break / waiting) freeze the phase and shift deadlines on resume.
- Each socket gets its own filtered view. Patches are diffs of that view, so a patch can't leak more than a snapshot.
- Synced moments ride on view timestamps (`phaseAt`, `flashAt`) with a 600 ms lead (G1). The client schedules audio on the AudioContext clock and visuals with rAF.
- Two adapters run the same engine: the Durable Object (`src/worker`, production) and Node `ws` (`src/node`: tests, e2e, `pnpm --filter @tap-in/server dev`). `TIME_SCALE` speeds up game timers on the Node adapter only; e2e uses 0.4.

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # all must pass before pushing
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e   # in the Claude cloud sandbox
pnpm --filter @tap-in/server dev     # Node room server on :8787
pnpm --filter @tap-in/web dev        # client on :5173
```

## Gotchas learned the hard way

- **The sandbox proxy blocks WebSockets.** You can't run e2e against the live site from the Claude cloud sandbox; use the `e2e-prod.yml` workflow instead. `curl` against the live server works for HTTP checks.
- **WebKit is only in CI.** The sandbox has Chromium only. Don't run `playwright install`. To mimic iPhone-only UI (e.g. the silent-switch notice), run Chromium with an iPhone user agent.
- **Nothing may cover the action zone** (DESIGN.md §0). A fixed banner over the bottom once blocked the Drink "Done" button on iPhone. Notices now sit in the page flow (`SoundChips`).
- **WebKit e2e:** headless WebKit throttles background pages, so the `tap()` helper in `e2e/game.spec.ts` calls `bringToFront()` before clicking. `actionTimeout` is 20 s.
- **Multi-step rounds:** an input can move the step on (Secret Word's next hint turn); the engine re-reads `deadline()` after every input. A fixed-length synced step (Liar's Prompt `show`) returns `endsEarly: false`.
- **Reactions are outside the view.** They arrive as `reaction` messages, live in `ClientRoomState.reactions`, and are never stored or versioned. `canReact` (shared) is the one rule for when a phone may send or show one.
- **Layout with the reaction lane:** `.screen` gives up `--react-lane` when the lane follows it (`styles/reactions.css`). Anything new at the bottom of a screen must stay in the page flow.
- **Leak tests read raw frames.** `apps/server/test/deception.test.ts` checks every message a phone received, not just its final view. When a test refreshes a phone, keep reading from a phone that wasn't refreshed (the old socket's view goes stale).
- **`AGENTS.md`** is regenerated by Turborepo; leave it committed. The workerd test config aliases `obscenity` to its CJS entry (I9).
- **ESLint is strict type-checked, and `react-hooks` v6 rules apply.** No setState directly in effects, no ref writes during render.
- **Vercel env var `VITE_SERVER_URL`** is baked in at build time. Changing it needs a redeploy.
- **Allowed origins:** the server allows `ALLOWED_ORIGINS` (`apps/server/wrangler.toml`), and `tap-in-*.vercel.app` previews whenever `https://tap-in.vercel.app` is listed.

## The user's standing rules (from the original brief)

- Runs from one link in iOS Safari + Android Chrome. No downloads, no logins, no shared screen.
- The drink instruction is only ever the word **Drink**. No amounts; the validator bans "sip", "shot", "chug".
- Refresh, lock or disconnect always rejoins into the current phase with private info restored.
- The server owns all state and timers; private info never reaches the wrong client.
- All 11 games ship in v1.
- Build in phase order. Each phase ends deployed, tested, committed, with `PROGRESS.md` updated.
- Record every open choice in `DECISIONS.md` with a one-line reason.
- Push back when something hurts fun, performance or reliability.
- **Priority: readable > playable > fun.** Players are in Ontario, Canada, 5 friends in the same room.
- Small conventional commits, and keep `main` deployable. Work on a `claude/*` branch, open a PR, and get CI green before merging.
