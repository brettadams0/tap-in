# Tap In: Build Plan

Status: **approved 2026-10-02**, with the answers below folded in. Changes since the first draft: the room server moves from Fly.io to Cloudflare Durable Objects (free plan), and there is now a "claim a seat" rejoin flow.
Source of truth: [`SPEC.md`](./SPEC.md). This plan covers how I'll build it, where I read the spec a certain way, and where I think the spec should change.

---

## 0. Questions and spec gaps

### 0.1 Answers (from Brett, 2026-10-02)

| #   | Question             | Answer → what I'm doing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Room server host     | "Best free option." Fly.io no longer has a free tier, and Render's free tier sleeps and loses memory. **Cloudflare Workers + Durable Objects** is free and fits this exactly: one stateful object per room, WebSockets, timers (alarms) and built-in storage that survives restarts. See §1. **You'll need:** a free Cloudflare account, plus an API token + account ID saved as GitHub secrets. I'll send step-by-step instructions in phase 1.                                                                                                                                                                                                                                                                                                                   |
| Q2  | Region               | Ontario, everyone in the same room. Rooms get a location hint of `enam` (eastern North America), so the object runs close to Toronto (~10–30 ms).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q3  | Vercel               | Free Hobby account, `tap-in.vercel.app`. That's fine for a non-commercial party game.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q4  | Prompt bank minimums | You left this to me. **Each spice level gets its own full set**, e.g. 60 Chill + 60 Spicy + 60 Unhinged Would You Rather. That keeps every level feeling fresh and makes repeats rare. It's about 1,380 prompts in total, written in phase 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q5  | Late joiners         | **No new players after Start.** Only existing players can get back in. Two tools cover the real-world problems:<br>• **Claim a seat:** if a player's phone loses its saved session (new browser, private tab, opened the link in an in-app browser), they open the room link and see "Are you…?" with the _disconnected_ players listed. They tap their name, the host gets an Approve / Deny prompt, and they're back with their drinks, stats and secrets restored. Their old tab is kicked.<br>• **Remove player (host):** for someone who has really left. They're out of the rotation right away and their seat is closed.<br>Why not "remove then let someone join": claiming keeps the player's history and stops a stranger with the link from barging in. |

### 0.2 Push-backs (spec changes I recommend; I'll build these unless you object)

- **P1. Countdown is trivial unless players are stopped from tapping twice in a row.** As written, one player can count to 8 alone and nobody ever collides. Proposal: your tap button greys out after you tap, until someone else taps. This keeps the "no set order" tension the game is about.
- **P2. Secret Word needs a per-turn timer, not 25 s in total.** Hints are given in turn order. A single 25 s window for 5 sequential hints is too short, and 25 s _per turn_ drags. Proposal: 15 s per turn, which ends early on submit. If time runs out the hint shows as "🤐 (no hint)", which is suspicious and funny. The outsider is never first in the turn order: going first with no information isn't fun, and it costs only a little deduction.
- **P3. Connected but idle is not the same as disconnected.** The spec says a disconnected player's missing input is an abstain with no penalty. If a _connected_ player who just doesn't answer were also safe, ignoring the phone would be the best strategy. Proposal: a connected non-submitter takes the worst outcome wherever a game ranks players (0 taps, slowest reaction, 0 votes, furthest rank). A disconnected player is excluded from scoring altogether, as the spec says.
- **P4. What the fairness cap covers.** "No more than 2 rounds in a row" gets ambiguous with group and self-inflicted drinks. Proposal:
  - The cap applies to **assigned** drinks: losing a comparison, being picked or being voted out.
  - It does **not** apply to "Everyone drinks", "everyone except X", or self-inflicted drinks (early tap, Countdown collision, choosing Drink over a dare). Moving those to someone else makes no sense, and exempting them stops people from farming the cap.
  - When the cap excuses one of several drinkers, the others still drink. If that leaves nobody, the next-worst player in the game's ranking drinks. If the game has no ranking (Would You Rather sides, Spin the Bottle), it shows a "lucky escape" moment instead. Spin the Bottle simply never picks a capped player.
- **P5. Rank It: drag plus tap-to-place.** Drag will be smooth on touch (spec). A tipsy thumb in a dim room also gets a fallback: tap the items in order 1→4. Same input, and it's more accessible.
- **P6. Two Truths: "That's true for me!" reroll.** "I've been to Iceland" will sometimes _be_ true. During setup each player sees their own fake fact privately and can reroll it once or twice. Otherwise the round is broken by a fluke.
- **P7. Profanity filter scope.** Display names are always filtered, as the spec requires. Free-text answers are always checked for slurs and hate terms. Mild swearing is allowed in answers at Spicy and Unhinged, because that's the point of those levels, and masked at Chill.
- **P8. `patch` = per-player view diffs.** The spec asks for both `state` and `patch`. I'll have the server compute each player's _filtered_ view and send a structural diff of it. A patch is derived from an already-filtered view, so it **can't** leak more than the snapshot does. It also keeps the client a "dumb renderer" and makes version-gap recovery trivial.
- **P9. Spice-neutral banks.** Trivia questions, Secret Word words and Two Truths fake facts barely change with spice. If Q4 = (a), each level still gets its own N entries, but Spicy and Unhinged entries for those banks are cheekier _topics_ (bar trivia, nightlife words, "I once got kicked out of a karaoke bar") rather than innuendo.
- **P10. Visual regression runs with reduced motion and a fixed seed.** Screenshots of mid-animation frames are flaky. e2e screenshot tests run with `prefers-reduced-motion`, a seeded RNG and a time-scaled server, so baselines are stable. Separate smoke tests check that the full-motion path renders.

### 0.3 Smaller interpretations (these will go in DECISIONS.md)

- **"Majority catches the imposter"** means the imposter gets _more than half_ of the votes cast. A plurality isn't enough. The imposter votes too, since they don't know they're the imposter.
- **Fake Answer "too close"** means a normalised (lowercased, accents and punctuation stripped) Levenshtein similarity of 0.75 or more, or one answer containing the other, after removing filler words. Two identical fakes from different players are merged into one card, and both authors get the credit.
- **Spin the Bottle flow:** spin (synced), then a 20 s Dare/Drink choice (a timeout counts as Drink), then a 20 s perform window, then a 10 s Done/Nope vote. The player drinks if Nope beats Done. An active dare shows as a badge on that player's avatar.
- **Reaction Shotgun:** about 30% of rounds include a fake-out flash before the real one. The client reports its locally measured reaction time. The server clamps anything under 90 ms to "early" and also flags as early any tap it receives before `playAt - 50 ms`.
- **Session length** sets a time budget. The engine won't start a game block whose estimated length would overshoot the budget by more than 50%, and it always finishes the block in progress. Estimates: Short ≈ 5 blocks, Standard ≈ 10, Long ≈ 11 + a second cycle. Two Truths is capped at 3 spotlights on Short and when there are more than 6 players.
- **Below 3 active players** mid-game, the room pauses with "Waiting for players…". The host can end the session from there.
- **Skip-prompt flags** are logged to server stdout as `{bankId, promptId}` only, with nothing that identifies a player.
- **Room link format:** `https://tap-in.vercel.app/ABCD`. The code alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O), and codes are filtered against a rude-word list.

---

## 1. Stack, with reasons

| Layer           | Choice                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript 5, `strict` + `noUncheckedIndexedAccess` everywhere                                                                          | Shared types end to end. No `any` (enforced by lint).                                                                                                                                                                                                                                                                                                                   |
| Monorepo        | pnpm workspaces (+ Turborepo for task caching)                                                                                          | Fast installs, strict deps, and cached CI runs across 4 packages                                                                                                                                                                                                                                                                                                        |
| Client          | **Vite + React 19** SPA                                                                                                                 | No SSR needed (every screen is live socket state), the smallest bundle, and Vercel serves it as static files from the edge. Next.js would add weight and server features we'd never use.                                                                                                                                                                                |
| Animation       | **Motion** (`motion/react`, using `LazyMotion` + `m`) for layout and orchestration; plain CSS keyframes for loops                       | Layout animations (avatars flying to sides, cards dealing, `Reorder` drag for Rank It) are Motion's strength. `LazyMotion` keeps it at about 15 KB gz. Everything animates only `transform` and `opacity`.                                                                                                                                                              |
| Audio           | Raw **Web Audio API**: a tiny in-house synth that renders to `AudioBuffer`s via `OfflineAudioContext`, plus a few CC0 samples           | Sample-accurate `start(when)` scheduling for sync. Per-player pitch and timbre variants are free with synthesis. Nearly zero bytes, well under the 1.5 MB budget. Tone.js (~100 KB) isn't worth it.                                                                                                                                                                     |
| Realtime server | **Cloudflare Workers + Durable Objects** (SQLite-backed, free plan), one object per room, with the WebSocket Hibernation API and alarms | One single-threaded, stateful object per room is exactly the "one authoritative state machine" the spec asks for. Room state is saved to the object's own storage on every change, so deploys, evictions and crashes don't lose a party. The free plan gives 100k requests/day and 13k GB-s/day, which covers dozens of 45-minute sessions a day. No server to babysit. |
| Validation      | **Zod** (server only) for every inbound message and content bank                                                                        | Rejects malformed input and cheating. Kept _out_ of the client bundle: the client trusts typed server output and only needs the TS types.                                                                                                                                                                                                                               |
| Profanity       | `obscenity`                                                                                                                             | Handles leetspeak and lookalike characters, with a tunable word set (needed for P7)                                                                                                                                                                                                                                                                                     |
| QR              | `qrcode-generator` (lazy-loaded)                                                                                                        | About 10 KB, and loaded only on the lobby share sheet                                                                                                                                                                                                                                                                                                                   |
| Tests           | Vitest (unit + integration, v8 coverage), Playwright (WebKit iPhone 14 + Chromium Pixel 7), Lighthouse CI                               | Matches the spec's test pyramid                                                                                                                                                                                                                                                                                                                                         |
| Lint/format     | ESLint (typescript-eslint strict-type-checked) + Prettier                                                                               | Enforced in CI                                                                                                                                                                                                                                                                                                                                                          |
| CI/CD           | GitHub Actions. Vercel Git integration for the client; `wrangler deploy` from Actions for the room server after CI is green on `main`   | `main` is always deployable, and nothing deploys unless it's green                                                                                                                                                                                                                                                                                                      |

**Why not the alternatives**

- **Fly.io:** the best plain-Node option, but it's no longer free.
- **Railway:** a trial credit, then a small monthly fee.
- **Render free:** sleeps after 15 min idle (about a 50 s cold start) and loses in-memory rooms.
- **Supabase Realtime with host authority:** ruled out by the spec.

**How Durable Objects shape the code**

- **Host-agnostic engine.** The `RoomEngine` is pure TypeScript with injected `Clock`, `Scheduler` and `Storage` interfaces. The Durable Object is a thin adapter around it: WebSocket in, views out, alarm, then `engine.onTimer()`.
- **Timers.** A Durable Object has one alarm, so the adapter keeps a small timer queue in state and points the alarm at the earliest deadline. Short timers while sockets are active (e.g. the 600 ms Countdown window) also use in-memory `setTimeout`, with the alarm as the backstop.
- **Hibernation.** Idle rooms (lobby chatter, long votes) hibernate and cost nothing. On wake, the engine reloads from storage. Each socket's `playerId` is kept in its hibernation attachment.
- **Clock.** In Workers, `Date.now()` only advances between I/O events. That's fine for us: `pong.serverTime` is stamped when the ping arrives, which is exactly the instant clock sync needs. Documented in DECISIONS.md.
- **Testing.** Integration tests run the real Worker and Durable Object in-process through `@cloudflare/vitest-pool-workers` (workerd), with 5 real WebSocket clients. Most engine and integration tests also run against a tiny Node `ws` adapter for speed. Both adapters share one test suite.
- **Privacy at rest.** Room storage is deleted when the room expires (30 min with nobody connected, via an alarm), so typed answers never outlive the session.

---

## 2. Repo structure

```
tap-in/
├─ SPEC.md  PLAN.md  DESIGN.md  DECISIONS.md  PROGRESS.md  TESTING.md  CREDITS.md  README.md
├─ apps/
│  ├─ web/                      # Vite + React client (Vercel project "tap-in")
│  │  ├─ src/
│  │  │  ├─ net/                # socket client, backoff, version/patch apply, clock sync
│  │  │  ├─ audio/              # AudioContext unlock, synth, sample loader, scheduler
│  │  │  ├─ sync/               # playAt → audio time / rAF scheduling (shared with visuals)
│  │  │  ├─ screens/            # Home, Join, Lobby, Intro, TitleCard, Drink, Results, Ended…
│  │  │  ├─ games/<gameId>/     # one UI folder per game (lazy-loaded chunk)
│  │  │  ├─ ui/                 # design-system primitives (Button, Timer, Avatar, Stamp…)
│  │  │  └─ store/              # tiny store: current RoomView + local prefs
│  │  ├─ public/fonts/          # self-hosted woff2 subsets
│  │  └─ e2e/                   # Playwright specs + screenshot baselines
│  └─ server/                   # room server: Cloudflare Worker "tap-in-server" + Durable Object "Room"
│     ├─ src/
│     │  ├─ room/               # RoomEngine (state machine), drink system, rotation, host/presence
│     │  ├─ adapters/           # durable-object.ts (prod), node-ws.ts (fast tests / local dev)
│     │  ├─ transport/          # message routing, rate limiter, HTTP (create room, health)
│     │  └─ views/              # per-player projection + diffing
│     ├─ test/integration/      # 5-client in-process tests, leak tests, chaos tests
│     ├─ wrangler.toml
├─ packages/
│  ├─ shared/                   # message types + Zod schemas, RoomView types, clock math, RNG
│  └─ games/
│     ├─ src/<gameId>/          # logic.ts, views.ts, content.ts, <gameId>.test.ts, index.ts
│     ├─ src/kit/               # helpers: voting tally, ranking, tie handling, text similarity
│     └─ src/registry.ts        # list of GameModules
├─ content/                     # prompt banks: <bank>.v1.json, with spice tags
├─ scripts/validate-content.ts  # build-time bank validation (fails the build if any bank is short)
└─ .github/workflows/ci.yml  deploy-server.yml
```

Adding a 12th game takes `packages/games/src/<id>/`, `apps/web/src/games/<id>/`, `content/<id>.v1.json` and one registry line.

---

## 3. Room state machine

The server owns everything. A room is one `RoomEngine` instance with an injected `Clock` (for `now()`) and `Scheduler` (for timers). It never imports a game directly, only the registry.

```
             ┌───────────── rematch ───────────────────────────────┐
             ▼                                                     │
 lobby ──start──▶ intro ──▶ gameIntro ──▶ roundInput ──▶ roundReveal ──▶ drink ─┬─▶ roundInput (next round)
   ▲  (≥3 players) (synced)  (3 s card)    (game steps)    (choreographed) (Drink) ├─▶ gameOutro ──▶ gameIntro (next game)
   │                                                                             └─▶ gameOutro ──▶ results ─┘
   └──────────── host "back to lobby" ──────────────────────────────────────────────────────────────────┘

 Overlays (freeze the current phase, then resume with deadlines shifted):
   paused(host, 60 s) · waterBreak(10 s, between rounds, ~every 10 min) · waitingForPlayers(<3 active)
```

- **Phase record:** `{ phase, startedAt, endsAt | null, version }`. Every deadline is an absolute server timestamp.
- **`roundInput` hosts game-defined steps.** Liar's Prompt has `answer → answersShow → vote`, Secret Word has `turn(i) → vote → outsiderGuess`, Spin the Bottle has `spin → choice → perform → confirm`. The engine doesn't care about the steps. It just applies the `Step` the game returns (next deadline, cues, and whether the round is over). Clients render by `(gameId, step)`.
- **Early end:** after each input the engine asks the game `awaiting(state)` for who is still expected to act. If none of those players are connected, the engine fires the step's timer immediately.
- **Pause:** the engine stores `remaining = endsAt - now`, cancels the timer, and on resume re-issues `endsAt = now + remaining` with a new version.
- **Presence (engine, not games):**
  - per player: `connected | reconnecting (grey badge) | gone (>3 min, out of rotation) | removed`
  - host gone 30 s or more → host moves to the connected player with the earliest `connectedSince`
  - no connections for 30 min → room deleted, along with its stored state
  - after Start, `join` is refused. A seat can only be **claimed** (host approves), and the host can **remove** a player (seat closed, out of the rotation)
- **Drink system (engine):** the game's `RoundResult` → apply the fairness cap (P4) → produce a `DrinkOutcome`: `{ individual: PlayerId[], everyone: boolean, exceptions?: PlayerId[], capNote? }` → log the drinks → schedule cues (`drink.you` only for the drinker's socket, `drink.other` for everyone else, `drink.everyone` for all).
- **Rotation (engine, pure function in `packages/shared`):** `pickNextGame(history, enabled, meta, rng)`:
  - hard rule: no repeats until every enabled game has played
  - soft rules, relaxed in this order when they can't be met: (1) every 3rd block is quick, (2) no back-to-back `speed`, (3) no back-to-back `typing`
  - a small search over the remaining pool, so the result is always valid when one exists. Unit-tested by property: for every enabled subset, the hard rule always holds.

---

## 4. Shared mini-game interface

```ts
// packages/shared/src/game.ts (sketch)
export interface GameModule<S, I, Pub, Priv> {
  id: GameId;
  meta: {
    name: string; rule: string;               // title card copy
    energy: 'speed' | 'typing' | 'social' | 'luck' | 'group';
    quick: boolean;                           // eligible for "every 3rd block"
    minPlayers: number;
    rounds(ctx: SetupCtx): number;            // e.g. Two Truths = min(players, cap)
    estimateMs(ctx: SetupCtx): number;        // used by the session-length budget
  };
  inputSchema: ZodType<I>;                    // validated by the server before onInput
  init(ctx: GameCtx): S;                      // ctx: players, settings, rng, content, now
  startRound(s: S, ctx: GameCtx): Step<S>;
  onInput(s: S, playerId: PlayerId, input: I, ctx: GameCtx): Step<S> | Reject;
  onTimer(s: S, ctx: GameCtx): Step<S>;
  awaiting(s: S): PlayerId[];                 // drives "X of 5 locked in" and early end
  reveal(s: S): RoundResult;                  // drinkers, ranking (worst→best), awards, reveal payload
  publicView(s: S): Pub;                      // safe for everyone
  privateView(s: S, playerId: PlayerId): Priv;// only this player's secrets
}

type Step<S> =
  | { kind: 'continue'; state: S; step: string; endsAt: number | null; cues?: Cue[] }
  | { kind: 'roundOver'; state: S };
type Reject = { kind: 'reject'; reason: 'tooClose' | 'containsWord' | 'invalid' | … };
```

- **Pure and deterministic.** `GameCtx` injects `rng` (a seeded, serialisable sfc32), `now`, the content slice and the player list. No I/O, no `Date`, no `Math.random`. That makes every game unit-testable with no network, and persisting and restoring state works for free.
- **Privacy by construction.** The server never broadcasts state. Each socket gets `RoomView = { room, game: publicView(s), me: privateView(s, id) }`. Votes, real answers, roles and fake facts live only in `S` until `reveal` puts them into the public payload.
- **Content stays on the server.** Prompt banks (including Fake Answer's real answers) are never bundled into the client. Only the current round's text is sent.

---

## 5. Realtime protocol and clock sync

**Messages** (a discriminated union on `type`, in `packages/shared`):

- Client → server: `join`, `rejoin`, `ready`, `submit`, `vote`, `tap`, `hostAction` (settings / start / pause / kick / rematch / end), `flag`, `ping`, `resync`, plus `avatar` (lobby/results only) and `react {to, reactionId}`
- Server → client: `state` (full view + `version`), `patch` (`baseVersion → version` diff), `schedule` (`{cue, playAt, data}`), `pong` (`{t0, serverTime}`), `error`, plus `reaction`. The recipient gets the full reaction. Everyone else gets only `{from, to, kind}` (the emoji, or 💌 for a note), so the words of a note never reach a third phone. Reactions are outside game state and versioning and are never stored (DESIGN.md §12).
- Room creation is `POST /rooms` (returns the code); everything after that goes over WS.
- **Versioning:** if a client sees `patch.baseVersion !== myVersion`, it sends `resync` and gets a `state`.
- **Rate limits:** a token bucket per socket (about 20 msgs/s, burst 40) plus per-phase input rules (one submit per step, Countdown taps at most 1 per 250 ms). Input from the wrong phase or step gets an `error` and is ignored.

**Clock sync (NTP-style):**

1. The client sends `ping{t0 = performance.now()}`. The server replies `pong{t0, serverTime}`. The client records `t1`.
   - `rtt = t1 - t0`
   - `offset = serverTime - (t0 + t1) / 2`
2. On connect: 5 samples about 100 ms apart. Take the **median offset of the 3 lowest-RTT samples**. Refresh every 30 s with a rolling window, and re-sample on `visibilitychange` (after a phone unlock the clock may have jumped).
3. `serverToLocal(t) = t - offset` (on the `performance.now()` timeline).
4. **Audio:** map to the AudioContext clock using `ctx.getOutputTimestamp()` (`contextTime ↔ performanceTime`), minus `ctx.outputLatency` where reported, then call `source.start(when)`.
5. **Visuals:** a per-cue `setTimeout` wakes about 30 ms early, then rAF fires on the first frame where `now ≥ target`. Flash, reveal hit and bottle stop all use the _same_ `playAt`.
6. **Lead time:** the server sets `playAt = now + 600 ms`, which absorbs network jitter on the same Wi-Fi. A cue arriving up to 150 ms late plays immediately, offset into the buffer. Later than that, the sound is skipped and the visual snaps to its end state.
7. All of this is pure math in `packages/shared/clock.ts` and unit-tested with synthetic skew and jitter. A dev-only `/sync-test` page flashes and beeps every 2 s across phones for the real-device check (TESTING.md).

**Reconnect:** `localStorage{roomCode, playerId, reconnectToken}`. The token is 128-bit random and stored only as a hash on the server.

- **Backoff:** 0.5 / 1 / 2 / 4 / 8 / 10 s, with a small "Reconnecting…" banner.
- **On `rejoin`:** a full `state` including `me`, a fresh clock sync, and the "tap to resume audio" chip if the AudioContext is suspended.
- **Unknown or expired room:** "This room has ended" + Create New Room.

---

## 6. Design approach (DESIGN.md comes after this plan is approved)

I'll write DESIGN.md and show it to you before building any screens, as you asked. My leading direction is **"Tap In" as a riot of sticker-bomb + punch-card arcade**: chunky outlined type, halftone bursts that pop from every tap, ink-stamp lock-ins, and a ticket-stub motif for room codes. The alternatives I'll weigh in DESIGN.md are neon dive-bar signage and risograph zine. That's where the palette, fonts (a characterful display face plus a legible body face, self-hosted), per-game accents, motion rules, sound palette and the Drink takeover get decided.

---

## 7. Testing strategy (summary)

- **Unit (Vitest):** every game's logic (scoring, drinkers, ties, all abstain, 3 / 5 / 8 players, one disconnected), the fairness cap, rotation properties, schemas (malformed and out-of-phase input), clock math, text similarity and the content validator. Coverage gate: 90% lines on `packages/games` and `packages/shared`.
- **Integration (Vitest + real `ws`):**
  - Boot the server in-process with `TIMER_SCALE=0.02` and a fixed seed, connect 5 clients, and play every game to the end.
  - **Leak tests** record every frame each client receives and assert that no other player's secret appears in it (imposter question, outsider identity, secret word for the outsider, real answer before reveal, votes before reveal, Two Truths' fake before reveal).
  - **Reconnect tests:** kill and rejoin a client mid-input, mid-reveal and mid-drink, and assert the phase and private view match.
  - **Host transfer** after 30 s, using a fake clock.
  - **Chaos (phase 7):** random disconnects in every phase.
- **E2E (Playwright):**
  - 5 browser contexts in one test, as WebKit (iPhone 14) and Chromium (Pixel 7) projects.
  - The happy path from the spec: create, join by code _and_ by link, one round of every game (via a test-only `forceGame` hook), results, rematch.
  - A refresh mid-game returns to the same screen.
  - Screenshot baselines (P10).
- **Test-only hooks** (`TIMER_SCALE`, `SEED`, `forceGame`) are compiled in but turned on only when `TAPIN_TEST_MODE=1`, and the server refuses to start with that flag when `NODE_ENV=production`.
- **Budgets:** Lighthouse CI on the built client (Performance 90+, Accessibility 95+, Best Practices 95+), a `size-limit` check that keeps initial JS under 200 KB gz, and a broadcast-latency assertion in integration tests.

---

## 8. Deployment

- **Client:** Vercel project `tap-in` (root `apps/web`), with an SPA rewrite so `/:code` serves `index.html`. Env: `VITE_SERVER_URL`. Preview deploys point at the production server, and protocol changes are gated by a `protocolVersion` handshake. If a PR changes the protocol, I'll deploy a `tap-in-server-staging` Worker for it.
- **Server:** Cloudflare Worker `tap-in-server` (free plan) at `tap-in-server.<account>.workers.dev`, with a `Room` Durable Object class (SQLite-backed) and a location hint of `enam`. `wrangler deploy` runs from GitHub Actions only after CI is green on `main`. Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Health check: `GET /healthz`. Vars: `ALLOWED_ORIGINS`, `LOG_LEVEL`.
- **Testing the real setup:** every phase ends with the e2e happy path run against the _production_ URLs (a `pnpm e2e:prod` target), not just localhost.

---

## 9. Task list per phase

Every phase ends with: CI green → deployed (client + server) → `e2e:prod` smoke run → PROGRESS.md updated → commit. Commits follow conventional commits (`feat(games): …`, `fix(server): …`), are small, and keep `main` deployable.

### Phase 0: Plan and design (now)

- [ ] PLAN.md approved (this doc)
- [ ] DESIGN.md: art direction, palette, fonts, motion, sound palette, Drink moment, _approved before any screens_
- [ ] DECISIONS.md seeded with everything in §0.3 and §1

### Phase 1: Foundation

- [ ] pnpm monorepo, TS strict, ESLint + Prettier, Vitest workspace, Turborepo
- [ ] `packages/shared`: message union + Zod schemas, RoomView types, seeded RNG, clock-sync math (+ tests)
- [ ] Server: `POST /rooms` (code generation), ws transport, rate limiter, RoomEngine lobby (join, names with suffixing and profanity filter, avatars, settings broadcast)
- [ ] Rejoin with token, presence badges, host transfer (30 s), drop (3 min), room expiry (30 min), state persisted to Durable Object storage; **claim a seat** (host approval) and **remove player**; lobby locks at Start
- [ ] Client shell: Home / Create / Join (code + link), lobby with live players and settings, reconnect banner, "room ended" screen, wake lock, portrait guard, safe areas (functional, unstyled until DESIGN.md is approved)
- [ ] Clock sync client + `/sync-test` page
- [ ] CI workflow (lint, typecheck, unit, integration, build), Vercel project, Cloudflare Worker, deploy workflow
- [ ] Integration: 5 clients join, host transfer, rejoin restores the view. e2e: create + join by code and by link on both engines.

### Phase 2: First playable

- [ ] Design system from DESIGN.md: tokens, fonts, screen zones (status / content / action / margin), Button, Timer (urgent last 5 s), Stamp, TitleCard, banners
- [ ] **Cap builder** (DESIGN §11): 16 exclusive colours, 8 patterns, 10×10 faces, 12 toppers, Shuffle, remembered per phone; living caps (idle bob, blink, glance)
- [ ] Audio: unlock on Join/Ready, synth bank, scheduler (`playAt`), mute/volume, iOS silent-switch notice, tap-to-resume chip
- [ ] Engine: intro → gameIntro → roundInput → roundReveal → drink → gameOutro → results; rotation; session budget; pause and water break
- [ ] Drink system: cap (P4), logging, Drink takeover / other-drinks / everyone-drinks moments
- [ ] Games: **Would You Rather**, **Reaction Shotgun** (logic + tests + UI + sounds)
- [ ] Results screen (basic) + rematch
- [ ] Starter content for those two banks; content validator wired into the build
- [ ] Integration tests for both games + leak scaffold; e2e full loop; **first real-phone party test** (TESTING.md checklist)

### Phase 3: Deception games

- [ ] **Liar's Prompt**, **Secret Word** (per-turn steps, P2), **Two Truths, One App** (setup + reroll, P6), **Fake Answer** (similarity check, merged duplicates)
- [ ] Text kit: similarity, word-containment, profanity tiers (P7)
- [ ] Private-view leak tests for every secret listed in §7; reconnect-mid-step tests for each game

### Phase 4: Remaining games

- [ ] **Rank It** (drag via Motion `Reorder` + tap-to-place, P5), **Tap Race** (local count, server cap of 20/s), **Spin the Bottle** (server-decided, physics-feel easing, dare flow), **Fill in the Blank**, **Countdown** (600 ms server-side collision window, P1)
- [ ] **Reactions** (DESIGN §12): cap-strip sheet, `react` message, server rate limits + mute lists, recipient queue gated by phase, margin-zone sticker, note privacy leak test
- [ ] Integration + e2e: one round of all 11 games

### Phase 5: Content

- [ ] All 8 banks at their minimums for all 3 spice levels (per Q4), stranger-safety review pass, validator green
- [ ] Reaction pools (Kind / Funny / Glaze, 40+ each, spice-tagged), plus Capn commentary lines
- [ ] Skip-prompt flag flow (2 flags → skip + log)

### Phase 6: Polish

- [ ] Every signature animation in SPEC; per-game title slams and stings; card dealing, flying avatars, bar races, bottle spin, reaction flash
- [ ] Per-device sound signatures (pitch and timbre slot per player); private vs shared sound treatment
- [ ] End-screen awards: most drinks, best liar (imposter/outsider escapes + Master Liar + Two Truths fools), fastest thumbs (avg reaction + taps/s), most chaotic (early taps + collisions + dares dodged + Nope votes received)
- [ ] Reduced-motion mode, haptics (Android), 50 ms tap feedback audit, 60 fps traces at 4x throttle

### Phase 7: Hardening

- [ ] Full e2e suite on WebKit + Chromium, visual baselines per game
- [ ] Chaos tests (random disconnects/rejoins in every phase), host churn, deploy-restart restore test
- [ ] Lighthouse CI budgets, bundle-size gate, broadcast-latency check
- [ ] TESTING.md manual real-device checklist completed with one iPhone + one Android
- [ ] README (setup, env vars, deploy), CREDITS, DECISIONS, PROGRESS final; definition-of-done checklist ticked

---

## 10. Risks I'm watching

| Risk                                                                   | Mitigation                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS audio: suspended after lock, and the silent switch mutes Web Audio | Unlock on the first gesture, the resume chip, `navigator.audioSession.type = 'playback'` where supported (to be checked on a device), and the one-time silent-switch notice                                                                                     |
| Wake Lock missing on iOS < 16.4                                        | Feature-detect, plus a muted looping-video fallback only during play                                                                                                                                                                                            |
| Sync drift after a phone sleeps                                        | Re-sync on `visibilitychange` and before every scheduled cue that's older than 30 s                                                                                                                                                                             |
| A deploy mid-party                                                     | Durable Object state lives in storage, so the object reloads it and clients reconnect via backoff (§1)                                                                                                                                                          |
| Free-plan limits (100k req/day)                                        | Taps are counted on the phone and sent once (Tap Race); Countdown taps are rate-limited. A 45-minute, 5-player session is about 3–5k requests, well within the daily limit. If it's ever outgrown, the $5/mo Workers plan lifts the limits with no code change. |
| Content quality at ~1,400 entries                                      | Written in themed batches, then a stranger-safety review pass; you get a sample of every bank to sign off early in phase 5                                                                                                                                      |
| Bundle budget with React + Motion                                      | `LazyMotion`, one lazy chunk per game, fonts subset to Latin, `size-limit` in CI                                                                                                                                                                                |
