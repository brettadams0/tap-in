# Testing

## Automated (runs in CI on every push)

| Layer                      | Where                                  | What it proves                                                                                                                                                                                                                                                                           |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)              | `packages/shared/src/*.test.ts`        | rng determinism and resume, clock offset under jitter, `playAt` scheduling, room codes, names and profanity, view diff round-trips, schema rejection of malformed input. Coverage gate: 90% lines.                                                                                       |
| Engine unit                | `apps/server/test/engine.test.ts`      | lobby rules, host-only actions, start lock, rejoin tokens, presence (reconnecting → gone after 3 min), host transfer after 30 s, seat claims (approve, deny, replace, timeout, auto-approve), remove, expiry after 30 min, rate limits, and that patched client views equal server views |
| Integration (real sockets) | `apps/server/test/integration.test.ts` | Node adapter in-process, 5 real WebSocket clients: join, start, drop and rejoin into the same seat, host handover, ping/pong, broadcast under 150 ms                                                                                                                                     |
| Durable Object (workerd)   | `apps/server/test/worker/room.test.ts` | the real Worker + Room DO: create, join over WebSocket, state persisted to storage, rejoin on a new socket, the alarm expires and wipes the room                                                                                                                                         |
| E2E (Playwright)           | `apps/web/e2e/`                        | 5 phone contexts on WebKit (iPhone 14) and Chromium (Pixel 7): create, join by code and by link, live settings, refresh mid-lobby and mid-game restores the seat, start locks the lobby, claim a seat from a new phone with host approval, unknown room → ended screen                   |

Run everything locally with `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`.

Run e2e against production (after deploy) with:

```bash
E2E_BASE_URL=https://tap-in.vercel.app pnpm e2e
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

**Later phases (to be completed in phase 7)**

- [ ] Audio unlocks on first tap on iOS and plays after a lock or refresh.
- [ ] Synced sounds land together across phones.
- [ ] Haptics fire on Android.
- [ ] Wake lock keeps screens on during play.
- [ ] The game is readable and playable in a dim room.
