# Progress

## Phase 5: Content (code complete; real-phone test pending)

**Works**

- **Every bank is at its minimum for all three spice levels** (R2), and the build now fails on a short bank (`--strict`):

  | Bank                  | Chill | Spicy | Unhinged | Minimum  |
  | --------------------- | ----- | ----- | -------- | -------- |
  | Would You Rather      | 62    | 61    | 61       | 60       |
  | Rank It               | 32    | 32    | 32       | 30       |
  | Liar's Prompt         | 41    | 41    | 41       | 40       |
  | Two Truths fake facts | 82    | 82    | 82       | 80       |
  | Secret Word           | 82    | 82    | 82       | 80       |
  | Fake Answer trivia    | 51    | 51    | 51       | 50       |
  | Spin the Bottle dares | 42    | 42    | 42       | 40       |
  | Fill in the Blank     | 62    | 62    | 62       | 60       |
  | Reactions (per tab)   | 40+   | +10   | +10      | 40 a tab |

- **Stranger-safety pass** over every line (old and new): a kissed-by-a-stranger option and an accent pair swapped out, no drink quantities even in questions, no dare that asks you to share your phone. Trivia answers are facts I'm certain of (K2).
- **Skip-prompt flag:** a small 🚩 under the header strip on prompt screens (with a confirm sheet). Two flags from different players re-deal the round with a fresh prompt and a full timer, every phone shows "Skipped! Fresh one.", the prompt never comes back that session, and the server logs `{bankId, promptId}` only (R17, K5–K9).
- **Capn's commentary:** a short line from Capn in the reaction lane's empty slot on reveals, Drink moments, outros and results (never during input).
- **Budgets:** initial JS 84.9 KB gzipped (unchanged); the lazy reactions chunk grew to 8.8 KB gzipped with the bigger pools (was 5.6 KB).
- **Tests:** strict validator tests (per-tab reaction counts), a `prompt()` test for every banked game, an engine test for flags (privacy, re-deal, log shape, no repeats), Capn line tests and a Playwright run of the flag flow.

**Needs you**

- A real-phone party test (TESTING.md, phases 3–5), and a read of a few prompts at each spice level: wording is the one thing tests can't judge.

**Known issues / notes**

- The flag chip is 44 px tall (a secondary control, K5); primary actions keep 56 px.

**Next: Phase 6, polish** (signature animations, sound signatures, awards, the fun layer, reduced motion, haptics, 60 fps).

## Phase 4: Remaining games + Reactions (code complete; real-phone test pending)

**Works**

- **All 11 games are playable.**
- **Rank It:** drag rows to reorder, or tap them best to worst. The group's order lands, then everyone's distance bar grows; the furthest drinks.
- **Tap Race:** a synced 3-2-1 and GO, then 5 seconds of hammering a full-screen pad (burst, count and a pop that climbs in pitch). Counts are checked against 20 taps a second; the bars race; the fewest taps drinks.
- **Spin the Bottle:** the server picks before the spin (never a capped player); the bottle lands on the same cap on every phone with a whoosh and a clunk. Dare or Drink, 20 s to do it, then the room votes Done or Nope. Dares are checked for stranger safety at build time.
- **Fill in the Blank:** fill the blank, vote for your favourite (anonymous, never your own); authors are revealed with their votes, the top answer gets a crown and a cheer, the fewest votes drinks.
- **Countdown:** count to players + 3 together. Taps inside the same 600 ms (server time) collide: COLLISION!, a buzzer, and the count resets. You can't tap twice in a row. Reach the target and nobody drinks; run out of time and everyone does.
- **Reactions:** tap a cap in the lane at the bottom to send one of 8 emoji or a Kind / Funny / Glaze 🍩 note (4 lines dealt at random, 🔀 for more). The recipient gets a sticker that peels off after 4 s; everyone else sees the emoji, or just 💌/🍩 for a note. Only when you have time (never while you owe an answer, in a speed game or during your own Drink); reactions to a busy phone wait, and anything older than 20 s is dropped. Rate limits, per-player mute, a personal on/off and the host's room switch.
- **Sound:** a title sting for each new game, the synced 3-2-1, the bottle's whoosh and clunk, the Countdown ding (in the tapper's voice) and buzzer.
- **Content:** starter banks: Rank It 45 sets, Spin the Bottle 45 dares, Fill in the Blank 56 prompts, reactions 54 lines.
- **Tests:** 93 game unit tests (98.6% lines in `packages/games`), engine tests for every new game (including a refresh mid-step) and for reactions (note privacy, rate limits, timing), and Playwright rounds of all five games plus reactions.
- **Budgets:** initial JS 84.9 KB gzipped; game screens 13.8 KB; reactions 5.6 KB (both lazy).

**Needs you**

- One real-phone party test (TESTING.md, phase 4 list), ideally together with phase 3's.

**Known issues / notes**

- Prompt banks and reaction pools are starter-sized; phase 5 fills them (the validator warns until then).
- Countdown's ding plays when the patch arrives, so it can trail the tap on other phones by a network hop.

**Next: Phase 5, content** (done, see above).

## Phase 3: Deception games (deployed; real-phone test pending)

**Works**

- **Liar's Prompt:** one random imposter gets a slightly different question (nobody is told). Everyone types a short answer; the answers land one by one on every phone at the same moment, each with a stamp in the answerer's voice. Then everyone sees the real question and votes. More than half the votes on the imposter: they drink. Otherwise everyone except the imposter drinks, and the imposter gets a GOT AWAY WITH IT screen.
- **Secret Word:** everyone but the outsider sees the word; the outsider gets "Blend in." and the category. One-word hints go round in turn order (15 s each, the outsider is never first) and show on every phone as they land. Hints that give the word away are refused under the box; the outsider's never are, so a refusal can't leak the word. A caught outsider gets one guess: right, and everyone else drinks.
- **Two Truths, One App:** a private setup (two true facts, plus the app's fake for you with two rerolls if it's actually true), then one spotlight per round: three shuffled cards, everyone else picks the fake. Wrong guessers drink; if nobody is fooled, the spotlight player does. Only players who typed their facts get a spotlight, so the block shrinks to fit. Capped at 3 spotlights on Short or 7+ players.
- **Fake Answer:** an obscure trivia question; everyone writes a believable fake ("Too close, try again." when it's basically the real answer). The fakes and the real answer deal in shuffled; pick what's real, never your own. Anyone who picks a fake drinks. Identical fakes merge and share the credit; the best fake earns **Master Liar**.
- **Text kit:** normalisation (case, accents, punctuation, filler words), Levenshtein similarity, word containment, "gives the word away", profanity tiers (slurs always refused, swearing masked at Chill).
- **Drink system:** a new "everyone except…" moment (uncapped, R6), new reasons (caught, wrong guess, fell for a fake, nobody fell for it) and a "Sharp crowd" nobody-drinks.
- **Awards:** a first **Best liar** award (people fooled + escapes).
- **Sound:** a title sting for each new game; answers land with a stamp in each player's voice; no countdown ticks during the synced answer show.
- **Content:** starter banks: Liar's Prompt 52 pairs, Secret Word 81 words, Two Truths 80 fake facts, Fake Answer 52 trivia questions (all spice-tagged).
- **Tests:** 66 game unit tests (100% lines in `packages/games`), engine session tests with leak checks over every frame each phone received and a refresh mid-step for every deception game, real-socket leak tests, and Playwright rounds of all four games (the inline rejection, a refresh mid-setup).
- **Budgets:** initial JS 84.5 KB gzipped; the game screens chunk is 11.8 KB.

**Needs you**

- One real-phone party test (TESTING.md, phase 3 list).

**Known issues / notes**

- Prompt banks are starter-sized; phase 5 brings them to the minimums (the validator warns until then).
- Liar's Prompt, Secret Word and Fake Answer count as typing games, so the rotation never plays two of them back to back.

**Next: Phase 4, the remaining games** (Rank It, Tap Race, Spin the Bottle, Fill in the Blank, Countdown) and Reactions.

## Phase 2: First playable (deployed; real-phone test pending)

**Works**

- **Session flow (server):** intro → title card → rounds → reveal → Drink → outro → next game → results, with Rematch and Back to lobby. Every input step ends early once everyone connected has acted.
- **Rotation:** no repeats until every enabled game has played, every 3rd block a quick game, no speed or typing games back to back. Session length is a time budget that never cuts a game short.
- **Drink system:** 2-in-a-row fairness cap (excused, covered by the next-worst, or a lucky escape), self-inflicted drinks never capped, a per-player drink tally, Done button.
- **Pacing:** host Pause (60 s) and End from the ⋯ menu, a water break about every 10 minutes, and "Waiting for players…" below 3 active players or when everyone drops.
- **Would You Rather:** two big cards, private votes with a live "X of 5 locked in" row of caps with IN! stamps, caps fly to their side, the smaller side drinks, a tie is perfectly balanced, connected non-voters drink. 92 starter prompts across the 3 spice levels.
- **Reaction Shotgun:** a full-screen pad, a synced flash on every phone (scheduled from the server's time, revealed only 600 ms ahead), about 30% fake-outs (lilac NOPE with a different sound), reaction time measured on the phone, early taps drink, otherwise the slowest; ms leaderboard.
- **Drink moments:** a full-screen takeover on the drinker's phone (flood in their cap colour, DRINK slam, shake, grimacing cap, Done 🍺); a coaster with a DRINK sticker on everyone else's; EVERYONE DRINK stripes; a seesaw for nobody drinks; cap-saved stickers.
- **Audio:** every sound synthesised with Web Audio (title stings, timer ticks, reveal build and hit, the Drink horn only on the drinker's phone, glass clinks, the flash crack, the group sting), scheduled on the audio clock from server time, unlocked by any tap, per-player notes, mute and volume in the corner chip, the iOS silent-switch notice, and a "Tap for sound" chip when iOS suspends audio.
- **Results:** award stickers (Most drinks, Fastest thumbs, Cleanest record) and the drink tally.
- **Tests:** game unit tests, engine session tests (cap, pause, water break, waiting, rematch, budget), 5 real-socket phones playing both games with a reconnect and a vote-leak check, cue tests, and Playwright full loops (WYR with a refresh mid-vote and the Drink takeover; Shotgun flash and leaderboard).
- **Budgets:** initial JS 84 KB gzipped; the game screens load as a separate 7 KB chunk.

**Needs you**

- The same Cloudflare + Vercel setup as phase 1 (below). After the deploy: one real-phone party test (TESTING.md, phase 2 list).

**Known issues / notes**

- Only Would You Rather and Reaction Shotgun are playable. The other 9 games show as "Soon" in settings and are skipped.
- Prompt banks are starter-sized (about 30 per spice level). Phase 5 brings them to 60+.
- No CC0 crowd samples yet; the cheer is synthesised.

**Next: Phase 3, the deception games** (Liar's Prompt, Secret Word, Two Truths, Fake Answer).

## Phase 1: Foundation (code complete; deploy waiting on account setup)

**Works**

- **Monorepo:** pnpm + Turborepo, TypeScript strict (`noUncheckedIndexedAccess`), strict type-checked ESLint, Prettier, Vitest. CI on every push (lint, format, typecheck, unit + integration + workerd tests, builds, Playwright on WebKit + Chromium).
- **`packages/shared`:** typed protocol, Zod schemas for every client message, seeded serialisable RNG, NTP-style clock sync and `playAt` scheduling, room codes (no I/O/0/1, rude words filtered), names (grapheme-safe, de-duplicated, profanity-filtered), the 16-colour cap model, per-player view diffs. 99% line coverage.
- **Room server:**
  - one `RoomEngine` per room, persisted after every change
  - lobby join (3–8 players, colours exclusive), host-only settings, Start locks the lobby (needs 3+ connected)
  - silent rejoin by token; a newer tab replaces an older one
  - presence: reconnecting badge → gone after 3 min
  - host transfer after 30 s; room expiry after 30 min empty
  - **claim a seat** with host approval, plus **remove player**
  - ping/pong for clock sync; per-socket rate limit
  - runs as a Cloudflare Durable Object (hibernation, storage, alarm) and as a Node adapter for tests and dev
- **Client:**
  - home (Create Room / join by code), join by link, name, then the **Build your cap** screen (16 colours, 8 patterns, 100 faces, 12 toppers, Shuffle, remembered per phone)
  - live lobby: ticket with Share + QR, cap grid with host and reconnecting badges, host settings sheet, remove player, claim prompts
  - "Are you…?" seat-claim screen, room-ended screen
  - reconnect banner with 0.5 s → 10 s backoff, auto-rejoin on load, clock sync (5 pings, every 30 s, on unlock), Wake Lock, portrait guard, reduced-motion
  - `/sync-test` page for checking sync on real devices
- **Budgets so far:** initial JS 82 KB gzipped (budget 200 KB). Lobby broadcast to 5 sockets under 150 ms (asserted in integration tests).

**Needs you (one-time, about 10 min)**

1. **Cloudflare:** create a free account, then add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `SERVER_URL` to GitHub (README → Deploy).
2. **Vercel:** import the repo with Root Directory `apps/web`, and set `VITE_SERVER_URL`. The Vercel connector isn't allowed to create projects, so this has to be a dashboard click.

**Known issues / notes**

- WebKit e2e runs in CI only. The dev container has Chromium but no WebKit build.
- `AGENTS.md` at the root is generated by Turborepo when it detects an AI agent. It's harmless; it can be disabled with `"agentGuidance": false` in `turbo.json` if you'd rather not have it.

**Next: Phase 2, first playable**

Audio system with synced scheduling, the Drink system (fairness cap, takeovers), the rotation engine, the intro and title cards, **Would You Rather** and **Reaction Shotgun**, then a real-phone test.
