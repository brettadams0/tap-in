# Testing

## Automated (runs in CI on every push)

| Layer                      | Where                                                                                             | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)              | `packages/shared/src/*.test.ts`                                                                   | rng determinism and resume, clock offset under jitter, `playAt` scheduling, room codes, names and profanity, view diff round-trips, schema rejection of malformed input. Coverage gate: 90% lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Game unit                  | `packages/games/src/**/*.test.ts`                                                                 | the content validator in strict mode (every bank at its minimum, reactions per tab), which step of each game can be flagged, every game's rules: who drinks, ties, idle players (R5), exact-half votes, empty rounds, the text kit (similarity, containment, profanity tiers) and that each game's public and private views never carry another player's secret. Coverage gate: 90% lines.                                                                                                                                                                                                                                                                                                                             |
| Engine sessions            | `apps/server/test/session.test.ts`, `deception.test.ts`, `remaining.test.ts`, `reactions.test.ts` | full rounds of every game through the real engine; leak checks over every frame each phone received (imposter, imposter question, secret word for the outsider, other players' fakes and facts, the fake's position, the real answer's position, votes); a refresh mid-step for each deception game restores the private view                                                                                                                                                                                                                                                                                                                                                                                          |
| Engine unit                | `apps/server/test/engine.test.ts`                                                                 | lobby rules, host-only actions, start lock, rejoin tokens, presence (reconnecting → gone after 3 min), host transfer after 30 s, seat claims (approve, deny, replace, timeout, auto-approve), remove, expiry after 30 min, rate limits, and that patched client views equal server views                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Integration (real sockets) | `apps/server/test/*integration.test.ts`                                                           | Node adapter in-process, 5 real WebSocket clients: join, start, drop and rejoin into the same seat, host handover, ping/pong, broadcast under 150 ms; 5 phones play a WYR round (reconnect mid-vote, vote-leak check), a Shotgun round, and leak checks over the wire for Liar's Prompt, Secret Word and Fake Answer                                                                                                                                                                                                                                                                                                                                                                                                   |
| Durable Object (workerd)   | `apps/server/test/worker/room.test.ts`                                                            | the real Worker + Room DO: create, join over WebSocket, state persisted to storage, rejoin on a new socket, the alarm expires and wipes the room                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E2E (Playwright)           | `apps/web/e2e/`                                                                                   | full game loop (WYR round with a refresh mid-vote, Drink takeover, end, results, rematch; Shotgun flash and leaderboard; one round of each of the 9 newer games, including the inline "too close" rejection and a refresh mid-setup; reactions in the lobby: emoji, private note words, mute; the skip-prompt flag: two flags re-deal the prompt) at `TIME_SCALE=0.4`; `E2E_SHOTS=<dir>` saves screenshots of the deception screens for review; 5 phone contexts on WebKit (iPhone 14) and Chromium (Pixel 7): create, join by code and by link, live settings, refresh mid-lobby and mid-game restores the seat, start locks the lobby, claim a seat from a new phone with host approval, unknown room → ended screen |

Run everything locally with `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`.

Run e2e against production (after deploy) with:

```bash
E2E_BASE_URL=https://tap-in-omega.vercel.app pnpm e2e
```

## Manual real-device checklist

The automated suite can't prove sound sync, haptics or audio unlock. Run this with at least one iPhone and one Android on the same Wi-Fi.

**Phase 1 (lobby + sync foundation)**

- [ ] Open the production link on both phones; create a room on one and join on the other by code, then by QR.
- [ ] Lock one phone for 30 s, unlock it: it rejoins silently ("Reconnecting…" banner at most).
- [ ] Refresh the page in the lobby: it returns to the lobby with the same name and cap.
- [ ] Open `/sync-test` on all phones side by side: the flash and beep land together (within about 50 ms by eye and ear).
- [ ] Screens stay awake in the lobby (Wake Lock).
- [ ] Rotating to landscape shows "Tip me back upright!".
- [ ] Readable at arm's length in a dim room.

**Phase 2 (first playable)**

- [ ] Play one full session (Short) with 3+ phones: intro, title cards, both games, results, Rematch.
- [ ] Title stings, reveal hits and the Reaction Shotgun flash land together on every phone (within about 50 ms).
- [ ] The Drink horn plays only on the drinker's phone; everyone else hears a soft clink.
- [ ] Lock a phone mid-vote and unlock it: same screen, your vote still shown.
- [ ] The water break shows after about 10 minutes; the host can Pause and End from the ⋯ menu.
- [ ] iPhone: the silent-switch notice shows once; "Tap for sound" appears after locking and unlocking.

**Phase 3 (deception games)**

- [ ] Liar's Prompt: only one phone gets the different question; the answers land one by one on every phone at the same moment.
- [ ] Secret Word: the outsider's phone never shows the word; typing the word as a hint is refused under the box; a hint shows on every phone as soon as it's sent.
- [ ] Two Truths: the reroll swaps your fake; lock a phone mid-setup and unlock it: same fake, same rerolls left.
- [ ] Fake Answer: typing the real answer says "Too close, try again."; your own fake is marked "yours" and can't be picked.
- [ ] "Everyone except…": everyone else gets EVERYONE DRINK; the escapee sees GOT AWAY WITH IT.
- [ ] Typing on a phone keyboard never hides the Lock it in button.

**Phase 4 (remaining games + reactions)**

- [ ] Rank It: drag a row on a real touchscreen; it follows your thumb. Tapping items in order also works.
- [ ] Tap Race: the 3-2-1 and GO land together on every phone; mashing the pad never lags.
- [ ] Spin the Bottle: the bottle stops on the same cap on every phone; lock the chosen phone mid-dare and unlock it: still on the dare.
- [ ] Countdown: two people tapping together get COLLISION! and a buzzer on every phone.
- [ ] Fill in the Blank: the top answer gets the cheer.
- [ ] Reactions: a note's words show only on the recipient's phone; others see 💌 (🍩 for Glaze); a muted player's reactions never show; nothing ever covers a button.

**Phase 5 (content)**

- [ ] Read 5 prompts from each game at each spice level: nothing assumes shared history, targets anyone or asks for contact, touching or filming.
- [ ] Tap 🚩 on two phones during the same prompt: every phone gets a fresh prompt with a full timer and a "Skipped! Fresh one." note beside the flag; the flag never covers a button.
- [ ] Capn's line shows under reveals and Drink moments, never while you're still answering.

**Later phases (to be completed in phase 7)**

- [ ] Audio unlocks on first tap on iOS and plays after a lock or refresh.
- [ ] Synced sounds land together across phones.
- [ ] Haptics fire on Android.
- [ ] Wake lock keeps screens on during play.
- [ ] The game is readable and playable in a dim room.
