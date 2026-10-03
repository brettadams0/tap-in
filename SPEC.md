# Tap In — Claude Code Build Spec

Oct 2, 2026 · @Brett

## Mission and how to use this spec

Build Tap In, a browser-based party drinking game for 5 strangers, each playing on their own phone, with no TV, no app install and no accounts. Players join a room by link, QR or 4-letter code, and a rotating "party mix" of 11 mini-games tells losers to **Drink**.

**Naming:** the product name is **Tap In** everywhere players see it (title screen, tab title, share text, docs). The GitHub repo is `tap-in`, and package names, deploy project names and the default room-link domain use `tap-in`. The name should shape the identity: taps, bursts and punchy energy are the brand.

**Hard constraints (non-negotiable)**

- Runs from a single web link in iOS Safari (iOS 16+) and Android Chrome (last 2 versions), and also works on desktop browsers.
- No downloads, no native app, no login. A PWA "Add to Home Screen" option is fine, but never required.
- No shared screen. Every phone is both a controller and the shared board.
- The drink instruction is always the generic word **Drink** (a sip or a shot is the group's call). The app never specifies amounts.
- Designed for 5 players. The lobby accepts 3 to 8 so one dropout or extra friend doesn't kill the game, but all balancing and testing targets 5.
- A refresh, locked phone or dropped connection must never break the game. Players rejoin silently into the current phase.
- All 11 games listed in Game rules ship in v1.

**Where the session has creative freedom**

- Visual identity, name, mascot, palette, typography, animation choreography and sound palette.
- Exact timer lengths, scoring tweaks and prompt wording, within the rules below.
- Library and hosting choices, as long as they meet the architecture requirements and the reasoning is written in `DECISIONS.md`.

When this spec is silent, choose what makes the game more fun for 5 tipsy strangers holding phones in a loud room, and record the choice in `DECISIONS.md`.

## Product overview

A session is a lobby, then 20 to 40 minutes of rotating mini-games, then a results screen with one-tap rematch.

**Session flow**

1. **Create:** the host taps Create Room and gets a 4-letter code (no ambiguous letters like O/0, I/1), a shareable link and a QR code.
2. **Join:** others open the link or enter the code, pick a display name (max 12 characters, profanity-filtered) and an avatar (emoji or generated character). Duplicate names get auto-suffixed.
3. **Lobby settings (host only):** spice level (Chill / Spicy / Unhinged), session length (Short \~15 min / Standard \~30 min / Long \~45 min) and games on/off toggles. Everyone sees the settings live.
4. **Start:** enabled once 3+ players are in. A short animated intro plays on all phones in sync.
5. **Game block:** the server picks the next mini-game, shows a 3-second title card with a one-line rule, runs 3 to 4 rounds, then transitions to the next game.
6. **End:** a leaderboard with awards (most drinks, best liar, fastest thumbs, most chaotic), then Rematch (same room, same players) or Leave.

**Game rotation rules**

- Never repeat a game until every enabled game has played once.
- Alternate energy: avoid two speed games or two typing-heavy games back to back.
- Every 3rd game block should be a quick one (Reaction Shotgun, Tap Race, Countdown or Spin the Bottle) to reset energy.

**The Drink system**

- Every round ends with a synced reveal, then a Drink moment. The drinking player's phone gets a full-screen **Drink** takeover with a distinct sound. Everyone else sees the name and avatar with a smaller shared animation.
- "Everyone drinks" is a separate, bigger moment used for group failures.
- Fairness cap: the same player can't be told to drink more than 2 rounds in a row. When the cap applies, the next-worst player drinks instead, and the UI says so playfully.
- Ties: all tied players drink.
- Every Drink is logged per player for the end screen.
- A pacing nudge ("Water break? Next round in 10s") appears every \~10 minutes, and the host can trigger a 60-second pause anytime.

**Rejoin and resilience**

- On join, store `roomCode`, `playerId` and a `reconnectToken` in `localStorage`.
- On load, if those exist and the room is live, reconnect automatically and render the current phase, with remaining time and any private info (like a Liar's Prompt question) restored.
- A disconnected player shows a grey "reconnecting" badge to others. Their missing input becomes an abstain when the timer ends. They are never auto-penalized for disconnecting unless the game rules say otherwise.
- If the host is gone 30+ seconds, the host role passes to the longest-connected player.
- Players gone 3+ minutes are dropped from rotation, and the game continues with 3+.
- Rooms expire after 30 minutes with nobody connected.
- Screen Wake Lock should be requested during play, where supported, so phones don't sleep.

## Game rules

Each game is a self-contained module with its own phases, timers, private views and reveal animation. Timers are defaults the session may tune. Every input phase ends early when all connected players have submitted.

| Game | Type | Rounds | Input timer | Who drinks |
| --- | --- | --- | --- | --- |
| Would You Rather | Opinion | 4 | 15 s | Smaller side |
| Rank It | Opinion | 3 | 30 s | Furthest from group |
| Liar's Prompt | Deception | 3 | 30 s + 25 s vote | Imposter or group |
| Two Truths, One App | Deception | 1 per player | 45 s setup, 20 s guess | Fooled guessers |
| Secret Word | Deception | 3 | 25 s + 25 s vote | Outsider or group |
| Fake Answer | Bluff | 3 | 40 s + 25 s vote | Fooled voters |
| Reaction Shotgun | Speed | 4 | Random 2–7 s | Slowest or early tap |
| Tap Race | Speed | 3 | 5 s | Fewest taps |
| Spin the Bottle | Luck | 3 | 20 s choice | Chosen player |
| Fill in the Blank | Creative | 3 | 40 s + 20 s vote | Fewest votes |
| Countdown | Group | 3 | 30 s | Colliders or everyone |

### 1. Would You Rather

- Every phone shows the same two options as large tappable cards.
- Players vote privately. A live "X of 5 locked in" counter shows on every phone.
- Reveal: avatars fly to their chosen side in sync. The smaller side drinks. A tie means nobody drinks, with a "perfectly balanced" animation.

### 2. Rank It

- Everyone gets the same 4 items (for example, best fast-food fries) and drag-to-rank them on their phone. Drag must work smoothly on touch.
- Score each player by the sum of absolute differences from the group's average rank.
- Reveal: the group ranking animates into place, then each player's "distance" bar grows. The furthest player drinks.

### 3. Liar's Prompt

- One random player (the imposter) gets a slightly different question from everyone else. Example: "Name a fruit" vs. "Name a red fruit". Nobody is told who is who, including the imposter.
- Everyone types a short answer (max 30 characters). Answers reveal one by one in sync, alongside names.
- Then everyone sees the real question and votes on who the imposter is (no self-votes).
- If the majority catches the imposter, the imposter drinks. If not, everyone except the imposter drinks.
- Prompt pairs live in the prompt bank as `{ main, imposter }`.

### 4. Two Truths, One App

- Setup: each player privately types two true, harmless facts about themselves. The app adds one fake fact from a bank, written to sound plausible for anyone ("I've been to Iceland").
- Each round spotlights one player. All phones show their 3 facts, shuffled. The spotlight player can't vote.
- Everyone else guesses which fact the app invented. Wrong guessers drink. If nobody is fooled, the spotlight player drinks.
- Spotlight order rotates until every player has had a turn. If time is short, the session may cap it at 3 spotlights.
- Typed facts are filtered for profanity and length, and never stored past the session.

### 5. Secret Word

- Every player except one (the outsider) sees a secret word. The outsider sees "You're the outsider. Blend in." plus the category.
- In turn order, each player types a one-word hint that shows on every phone as soon as it's submitted.
- Then everyone votes for the outsider. If caught, the outsider gets one guess at the word: a correct guess makes everyone else drink, a wrong guess makes the outsider drink. If not caught, everyone except the outsider drinks.
- Hints that contain the secret word are blocked.

### 6. Fake Answer

- An obscure trivia question appears ("What was the original name of the Lego company's first product?").
- Each player writes a believable fake answer. Answers too close to the real one are rejected with "Too close, try again."
- All fakes plus the real answer show as shuffled options. Players vote for what they think is real. They can't vote for their own fake.
- Anyone who picks a fake drinks. Anyone who picks the real answer is safe. The author whose fake fooled the most people gets a "Master Liar" badge toward the end-screen awards.

### 7. Reaction Shotgun

- All phones show a "wait for it" state, then flash and buzz at the same server-scheduled moment, after a random 2 to 7 second delay.
- First tap after the flash counts. Reaction time is measured locally from the flash render to the tap, so network latency doesn't decide the winner.
- A tap before the flash is an early tap and an instant Drink. Otherwise the slowest player drinks.
- Reveal: a reaction-time leaderboard in milliseconds.
- Include a fake-out flash (different color, no buzz) in some rounds. Tapping the fake-out counts as an early tap.

### 8. Tap Race

- A synced 3-2-1 countdown, then 5 seconds of tapping a big button as fast as possible.
- Each tap gives satisfying feedback: a small burst, a counter tick and a short sound.
- Counts are local, then submitted. The server rejects impossible counts above \~20 taps per second.
- Reveal: bars race up on every phone. The fewest taps drinks.

### 9. Spin the Bottle

- A bottle (or a themed spinner) spins on every phone in sync. The server decides the result before the animation starts, and all phones land on the same player.
- The chosen player gets a mild, stranger-safe dare ("Do your best robot voice for the next round") or can tap **Drink** instead.
- Dares never involve touching anyone, sharing personal contact info, filming or leaving the area.
- Others confirm "Done" with a thumbs-up vote. If the majority says it wasn't done, the player drinks.

### 10. Fill in the Blank

- A prompt with a blank appears ("The worst thing to hear from your Uber driver is \_\_\_").
- Everyone types an answer (max 60 characters). Answers show anonymously, shuffled.
- Everyone votes for their favorite (not their own). Authors are revealed with votes.
- The fewest votes drinks. The top answer gets a crowd-cheer animation and sound.

### 11. Countdown

- The group must count from 1 to a target (number of players + 3) by tapping one at a time, with no talking and no set order.
- Each phone shows the current number and a big tap button. When someone taps, the number advances on all phones.
- If 2+ players tap within the same 600 ms window, that's a collision: those players drink and the count resets.
- Reaching the target means nobody drinks, with a big celebration. Running out of time means everyone drinks.
- Collision detection is server-side, using server receive time.

## Content and prompt banks

All prompts live in versioned JSON files under `content/`, tagged by spice level, so wording can change without touching game code.

**Spice levels**

- **Chill:** safe for anyone, including a first meeting.
- **Spicy:** cheeky, mild innuendo, embarrassing-but-fun.
- **Unhinged:** wild and absurd, but still never cruel.

Higher levels include the lower levels' prompts.

**Minimum bank size for v1 (per spice level)**

| Bank | Minimum entries |
| --- | --- |
| Would You Rather | 60 |
| Rank It sets (4 items each) | 30 |
| Liar's Prompt pairs | 40 |
| Two Truths fake facts | 80 |
| Secret Word words with category | 80 |
| Fake Answer trivia (question + real answer) | 50 |
| Spin the Bottle dares | 40 |
| Fill in the Blank prompts | 60 |

**Stranger-safety rules (apply to every prompt)**

- Works for people who know nothing about each other. No prompt assumes shared history.
- No prompts targeting race, religion, ethnicity, sexuality, gender identity, disability, body size or appearance.
- No dares involving physical contact, removing clothing, contacting someone outside the room, filming, or sharing personal info.
- "Most likely to" style content stays playful and is never accusatory.
- Players can tap a small "skip prompt" flag. Two flags in a session auto-skip that prompt and log it for content review.

**Validation**

A build-time script checks every bank for schema, duplicates, length limits and minimum counts. The build fails if any bank is short.

## Visual design and animation

The game should look like a hand-crafted party game, not an AI-generated template. Read the `frontend-design` guidance (or equivalent) before designing, and commit to one bold, cohesive art direction.

**Art direction requirements**

- Pick a distinct theme and carry it everywhere. Examples: retro arcade cabinet, neon dive-bar signage, risograph zine, sticker-bomb collage. The session chooses.
- Avoid generic AI-look tells: purple-to-blue gradients on white, glassmorphism cards everywhere, Inter-only typography, default shadcn styling, emoji as the only illustration.
- A characterful display font for titles and Drink moments, plus a highly legible body font. Self-host the fonts.
- Each mini-game gets its own accent color and title-card treatment within the shared system, so players feel the switch.
- Player avatars and colors stay consistent all session so strangers can tell each other apart fast.

**Clarity in a loud, dim room**

- Readable at arm's length: body text 18px+, primary prompts 28px+, Drink takeover 72px+.
- Tap targets at least 56px tall. Primary actions sit in the bottom third of the screen for one-handed use.
- Always show the current game, round ("Round 2 of 4"), timer and what the player should do right now.
- High contrast (WCAG AA minimum). Never rely on color alone for meaning.
- Respect safe areas (notches, home indicator) and support portrait only, with a friendly "rotate back" screen.

**Animation requirements**

- Animate every state change: joins, lock-ins, reveals, transitions and Drink moments. No hard cuts.
- Required signature animations (designs are the session's call):
  - Lobby: players pop in with their avatar as they join.
  - Game title card: a bold slam-in or flip per game.
  - Lock-in: a satisfying stamp or check when a player submits, visible on everyone's phone.
  - Timer: becomes more urgent in the last 5 seconds (pulse, color shift).
  - Reveal: a staggered, suspenseful reveal of answers or votes.
  - Drink takeover: a full-screen moment on the loser's phone (shake, confetti, splash or similar).
  - Everyone drinks: a distinct, bigger group animation.
  - Game-specific: avatars flying to sides (Would You Rather), bars racing (Tap Race), a physics-feel bottle spin (Spin the Bottle), a reaction flash (Reaction Shotgun), cards dealing (Fake Answer).
- Performance: 60fps on a mid-range Android (for example, a Pixel 6a or Galaxy A54). Animate only `transform` and `opacity` where possible.
- Honor `prefers-reduced-motion` with simpler fades, keeping all information intact.
- Haptics via the Vibration API where supported (Android). iOS Safari has no vibration support, so lean on sound and visual shake there.

**Responsiveness**

- Every tap gives visual feedback within 50ms, before any network round-trip (optimistic UI).
- Show a skeleton or animated state rather than spinners. Any wait over 300ms gets a playful loading state.

## Sound design

Sound should make five phones in one room feel like one game: shared moments play in sync on every phone, and personal moments play only on the phone they belong to.

**Sound palette**

- High quality, short, punchy and on-theme with the art direction. Every sound must match its on-screen moment.
- Sources: CC0 or properly licensed libraries (record licenses in `CREDITS.md`), or synthesized with the Web Audio API or a library like Tone.js. No copyrighted music or game sounds.
- Deliver as compressed audio (for example, `.m4a`/AAC plus `.ogg` fallback, or `.mp3`). Keep the total under \~1.5 MB, with the lobby set preloaded and the rest lazy-loaded per game.

**Required sound events**

| Event | Plays on | Notes |
| --- | --- | --- |
| Player joins lobby | All phones | Short pop, pitch varies per player |
| Game title card | All phones, synced | Unique sting per game |
| Lock-in / submit | Submitting phone | Satisfying click or stamp |
| Timer last 5 s | All phones, synced | Ticking that speeds up |
| Reveal | All phones, synced | Drumroll or build, then hit |
| You must Drink | Loser's phone only | Distinct, louder, comedic |
| Someone else drinks | Other phones | Softer reaction sound |
| Everyone drinks | All phones, synced | Big group sting |
| Reaction Shotgun flash | All phones, synced | Sharp cue at the flash moment |
| Tap Race taps | Tapping phone | Light tick, pitch rises with count |
| Bottle spin | All phones, synced | Spin whoosh, slowing to a clunk |
| Countdown tap / collision | All phones | Ding per number, buzzer on collision |
| Winner / celebration | All phones, synced | Short cheer |

**Unique sounds per device**

- Each player gets a personal sound signature (a pitch or instrument variant) used for their joins, lock-ins and Drink moments. When a sound plays across the room, people can tell whose phone it came from.
- Private moments (your secret role, your Drink) sound different from shared moments.

**Cross-device sync**

- Synced sounds are scheduled, not triggered on message arrival. The server sends `playAt` as server time. Each client keeps a clock offset estimated by periodic ping (NTP-style, median of \~5 samples, refreshed every 30 s) and schedules playback with the Web Audio clock.
- Target: synced sounds land within \~50ms of each other across all 5 phones on the same Wi-Fi.
- Visual moments tied to sounds (the flash, the reveal, the bottle stop) use the same scheduled time.

**Mobile audio rules**

- iOS requires a user gesture to unlock audio. The Join or Ready tap must unlock and warm up the `AudioContext`. If audio becomes suspended after a lock or a refresh, show a tap-to-resume chip.
- A per-device mute and volume toggle, always one tap away. Mute is stored locally.
- Warn once that the iOS silent switch mutes web audio.

## Architecture

The server owns all game state and every timer, and phones are thin clients that render whatever phase the server says the room is in.

**Recommended stack (the session may substitute with reasons in `DECISIONS.md`)**

| Layer | Recommendation | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode, everywhere | Shared types between client and server |
| Client | Next.js (App Router) or Vite + React | Fast mobile web, easy Vercel deploy |
| Animation | Framer Motion, GSAP, or CSS + WAAPI | Smooth transform/opacity animation |
| Audio | Web Audio API (optionally Howler.js or Tone.js) | Precise scheduled playback |
| Realtime room server | PartyKit or Cloudflare Durable Objects, or a Node WebSocket server on Fly.io/Railway | Needs a long-lived, stateful process per room with its own timers |
| Validation | Zod schemas for every message | Reject malformed or cheating input |
| Client hosting | Vercel | Matches the user's existing setup |

Important: Vercel serverless functions can't hold WebSocket connections or run room timers, so the realtime room server must live on a stateful platform. Pure client-side broadcast (for example, Supabase Realtime with the host phone as authority) is not acceptable, because a host refresh would freeze the game.

**Game engine design**

- One room = one authoritative state machine. Room phases: `lobby → intro → gameIntro → roundInput → roundReveal → drink → (next round | gameOutro) → … → results`.
- Every mini-game implements a shared interface, roughly: `init(players, settings, rng)`, `onInput(state, playerId, input)`, `onTimer(state)`, `reveal(state)` returning drinkers, `publicView(state)` and `privateView(state, playerId)`.
- Game logic is pure functions with an injected seeded RNG and clock, so it's deterministic and unit-testable with no network.
- The server sends each player only what they're allowed to see. Secret roles, the real Fake Answer, and other players' votes never reach a client early. Never hide secrets with CSS alone.
- All timers live on the server and are sent to clients as absolute deadlines (`endsAt` in server time), never as "seconds remaining".

**Networking and messages**

- WebSocket, with JSON messages as a typed discriminated union (`type` field) shared in a `packages/shared` module.
- Client to server: `join`, `rejoin`, `ready`, `submit`, `vote`, `tap`, `hostAction`, `ping`.
- Server to client: `state` (full snapshot on join or rejoin), `patch` (incremental updates), `schedule` (synced sound or visual at `playAt`), `pong`, `error`.
- Every state message carries a monotonically increasing `version`. Clients ignore stale versions and request a snapshot if they detect a gap.
- Rate-limit inputs per player. Validate every input against the current phase.

**Reconnect flow**

1. The client loads and finds `roomCode`, `playerId` and `reconnectToken` in `localStorage`.
2. It opens a socket and sends `rejoin`. The server verifies the token and replies with a full snapshot, including that player's private view.
3. The client renders the exact current phase, re-syncs its clock offset and resumes audio after the next tap.
4. Socket drops trigger exponential backoff (0.5 s, 1 s, 2 s, up to 10 s) with a small "Reconnecting…" banner. Never a full-screen error.
5. An invalid or expired room shows a friendly "This room has ended" screen with a Create New Room button.

**Project structure (suggested)**

- `apps/web`: the client.
- `apps/server`: the realtime room server.
- `packages/shared`: types, message schemas, game interfaces.
- `packages/games`: one folder per mini-game, with logic, tests and its prompt bank loader.
- `content/`: prompt banks.

**Coding principles**

- Small, single-responsibility modules. No game-specific logic in the room engine.
- Adding a 12th game should only take a new folder in `packages/games`, its UI component and its content file.
- No `any`. ESLint and Prettier enforced in CI.
- No secrets in the client bundle. Configuration via environment variables documented in `README.md`.
- No accounts, no analytics that identify players, and no storing typed answers after a room expires.

## Testing and quality gates

Nothing counts as done until it has an automated test, and the full suite runs green in CI on every push.

**Unit tests (Vitest)**

- Every mini-game's pure logic: scoring, who drinks, ties, edge cases (all abstain, 3 players, 8 players, one disconnected), the fairness cap and rotation rules.
- Message schema validation, including rejection of malformed and out-of-phase inputs.
- Clock-offset estimation and `playAt` scheduling math.
- Content bank validation script.
- Target: 90%+ line coverage on `packages/games` and `packages/shared`.

**Integration tests**

- Spin up a real room server in-process, connect 5 simulated clients and play every game end to end.
- Assert that private data never appears in another player's messages (secret roles, real answers, votes before reveal).
- Kill and reconnect a client mid-input, mid-reveal and mid-Drink, and assert it resumes in the correct phase with the correct private view.
- Host disconnect for 30+ seconds hands host to the right player.

**End-to-end tests (Playwright)**

- 5 browser contexts in one test, using mobile emulation for both WebKit (iPhone) and Chromium (Pixel).
- Full happy path: create, join by code and by link, play one round of every game, reach results, rematch.
- Refresh a page mid-game and assert it returns to the same screen.
- Visual regression screenshots of key screens per game on both viewports.

**Performance and quality budgets**

- Lighthouse mobile: Performance 90+, Accessibility 95+, Best Practices 95+.
- Initial JS under 200 KB gzipped. Time to interactive under 2.5 s on simulated 4G.
- Input-to-feedback under 50ms. Server state broadcast to all clients under 150ms on the same region.
- Animations hold 60fps in a Chrome DevTools performance trace with 4x CPU throttling.

**Manual checklist (documented in `TESTING.md`)**

The automated suite can't prove sound sync, haptics or audio unlock, so include a short checklist for a real-device test with at least one iPhone and one Android:

- [ ] Audio unlocks on first tap on iOS and plays after a lock or refresh.
- [ ] Synced sounds land together across phones.
- [ ] Haptics fire on Android.
- [ ] Wake lock keeps screens on during play.
- [ ] The game is readable and playable in a dim room.

## Build phases and definition of done

Build in vertical slices, so a playable, deployed game exists after phase 2 and every later phase adds to something that already works.

1. **Foundation:** monorepo, TypeScript strict, lint, CI, shared message schemas, room server with lobby, join, rejoin, host transfer and clock sync. Deploy the client to Vercel and the room server to its host on day one.
2. **First playable:** the art direction, sound system with synced scheduling, Drink system, rotation engine and two games (Would You Rather, Reaction Shotgun), fully tested on real phones.
3. **Deception games:** Liar's Prompt, Secret Word, Two Truths One App, Fake Answer, with private-view leak tests.
4. **Remaining games:** Rank It, Tap Race, Spin the Bottle, Fill in the Blank, Countdown.
5. **Content:** fill every prompt bank to its minimum for all three spice levels and pass validation.
6. **Polish:** signature animations, per-device sound signatures, end-screen awards, reduced-motion mode, performance budgets.
7. **Hardening:** full e2e suite on WebKit and Chromium, chaos tests (random disconnects during every phase), Lighthouse budgets, the manual real-device checklist.

At the end of each phase, update `PROGRESS.md` with what works, what's next and any known issues, and commit.

**Definition of done (v1)**

- [x] All 11 games are playable end to end by 5 phones from a single production URL.
- [ ] Works in iOS Safari and Android Chrome with no install and no login.
- [x] Refreshing or locking a phone at any moment rejoins into the correct phase.
- [x] No shared screen is needed at any point.
- [x] Every Drink moment shows only the word **Drink** and respects the fairness cap.
- [ ] Every state change is animated, every key moment has a matching sound, and synced sounds land together.
- [x] Private information never reaches another player's device.
- [x] Unit, integration and e2e suites pass in CI, and performance budgets are met.
- [x] Production deploy is live, with `README.md` (setup, env vars, deploy), `DECISIONS.md`, `TESTING.md`, `CREDITS.md` and `PROGRESS.md` complete.

_Status 2026-10-03:_ the two open items are built and pass on emulated WebKit (iPhone 14) and Chromium (Pixel 7) in CI and against production; they're ticked after the real-device checklist in `TESTING.md` (an iPhone and an Android in one room).
