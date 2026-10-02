# Progress

## Phase 2: First playable (code complete; real-phone test waiting on the deploy)

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
