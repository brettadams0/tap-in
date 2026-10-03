# Verify: prove Tap In v1 works, end to end

A brief for a fresh session whose only job is to **confirm the shipped game works**, and to fix whatever doesn't. v1 is code complete (phases 1–7 merged, see HANDOFF.md); the owner has played it by hand and it ran well. This pass looks for what neither of us has seen yet.

- Site: https://tap-in-omega.vercel.app
- Room server: https://tap-in-server.brettdev.workers.dev
- Rules that still apply: CLAUDE.md, and HANDOFF §10 (the Drink instruction is only ever the word "Drink"; readable > playable > fun; nothing covers the status or action zones).

## How to work

1. Every finding gets a **test that reproduces it first**, then the fix, then the test passing. No fix without a failing test, unless it's real-device-only (then say so in the PR).
2. Don't change behaviour that isn't broken. This is a verification pass, not a polish pass. Ideas go in a "Later" list in your final report.
3. Record any choice in DECISIONS.md (next free letter: **N1**), and log the pass in PROGRESS.md.
4. Branch `claude/*`, run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` before every push, open a PR, get CI green, merge with a merge commit, then confirm "E2E on production" is green on main.

## Step 1: the automated gates (expect all green)

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build                                   # includes the strict content validator
pnpm --filter @tap-in/web size               # bundle gate
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e                    # 2.5× timers
E2E_TIME_SCALE=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e   # real timers
```

Then on GitHub (MCP tools): the latest runs of **CI**, **Deploy server** and **E2E on production** on `main` are green, and production e2e ran against the current head of main. WebKit only runs in CI (don't `playwright install` in the sandbox).

Run the server suite three times in a row (`pnpm --filter @tap-in/server test`). Anything that fails once in three is a real bug: root-cause it, don't retry it.

## Step 2: the live site, from the sandbox

WebSockets to the production server **do work** from the sandbox (they didn't in earlier sessions; HANDOFF §8 is updated). So you can fill a real production room with bots:

```bash
curl -sI https://tap-in-omega.vercel.app | head -1                       # 200
curl -s -XPOST -H 'Origin: https://tap-in-omega.vercel.app' \
  https://tap-in-server.brettdev.workers.dev/rooms                      # {"code":"ABCD"}
pnpm --filter @tap-in/server bot ABCD --name Ana &                       # one bot phone per line
pnpm --filter @tap-in/server bot ABCD --name Ben &
```

`apps/server/scripts/bot.ts` joins like a phone, plays every game (random but valid inputs, Tap Race and Reaction Shotgun timed off the server clock), taps Done when it has to Drink, and rejoins after a dropped socket. Bots can't press Start: either drive a host phone with Playwright against the production URL (`E2E_BASE_URL=https://tap-in-omega.vercel.app`), or ask the owner to host on their phone and add bots to their room (it's how room FSGZ was tested).

Checks for a production room:

- [ ] A full **Long** session with 1 Playwright host + 4 bots reaches every one of the 11 games, then results, then Rematch.
- [ ] Kill a bot mid-round (`kill %2`) and start it again: it rejoins and the round finishes without waiting on it forever.
- [ ] Every Drink screen says exactly "Drink" (grep the host's DOM text; no amounts, "sip", "shot", "chug").
- [ ] The server's Cloudflare logs (if you have access) show no uncaught errors during the session.

## Step 3: per-game matrix

For each game, confirm on the local build (5 Playwright phones, `/?roundsPerGame=1&timeScale=1`, see `e2e/promo.spec.ts` for a template) that the input, the reveal, the Drink moment, and a refresh in each of those three come back to the same screen. The server half is covered by `apps/server/test/reconnect.test.ts`; this is the browser half.

| Game                | Watch for                                                             |
| ------------------- | --------------------------------------------------------------------- |
| Would You Rather    | tie handling; the smaller side drinks                                 |
| Reaction Shotgun    | early tap is caught; flash in sync                                    |
| Liar's Prompt       | only one phone gets the different question; answers land one by one   |
| Secret Word         | the outsider never sees the word; "Too close" on the word itself      |
| Two Truths, One App | reroll count survives a refresh                                       |
| Fake Answer         | the real answer is refused; your own fake can't be picked             |
| Rank It             | drag and tap-to-order both work; distances non-zero on the reveal     |
| Tap Race            | refresh mid-window loses that phone's count (known, HANDOFF §9)       |
| Spin the Bottle     | the bottle lands on the same cap everywhere; dare survives a lock     |
| Fill in the Blank   | the top answer gets the cheer                                         |
| Countdown           | COLLISION on simultaneous taps; the ding can trail by one hop (known) |

Also: 🚩 skip by two players gives a fresh prompt with a full timer; reactions never cover a button; host Menu → Pause, End game both work mid-round.

## Step 4: edges worth a try

- 8 players (the max); a 9th gets a clear "room full".
- Host leaves mid-game: host passes on, the game keeps going.
- Everyone but one leaves: the game ends cleanly (or waits), never hangs.
- A room left idle for a long time, then rejoined.
- Long names, emoji names, the profanity filter on names and typed answers.
- Landscape shows "Tip me back upright!"; a 320 px wide viewport stays readable.

## Step 5: real devices (owner only)

The TESTING.md "Manual real-device checklist" can't run in the sandbox (sound sync, haptics, audio unlock, wake lock). Hand it to the owner as a short list, and turn anything they report into a reproducing test where possible.

## Step 6: report

End with a short report to the owner: what you ran, what passed, what you fixed (PR links), and anything left that only a real device can confirm.

## Promo screenshots

`promo/` holds the advertising shots (`promo/screens/*.png`, 1082×2202, and `promo/hero.png`). To re-take them after a visual change (local Node server, real timers):

```bash
cd apps/web
PROMO_DIR=$PWD/../../promo/screens PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 \
  pnpm exec playwright test e2e/promo.spec.ts
```

The hero banner is an ImageMagick `montage` of six of them; see `promo/README.md`.

## Prompt to start the verification session

> You're verifying the Tap In project (repo: brettadams0/tap-in). Read VERIFY.md first, then HANDOFF.md and CLAUDE.md. v1 is shipped at https://tap-in-omega.vercel.app and the owner's manual test went well. Your job is to prove it works end to end and fix anything that doesn't: run every step in VERIFY.md in order, reproduce each problem with a failing test before fixing it, and don't change anything that isn't broken. Work on a claude/\* branch, run lint, format check, typecheck and tests before every push, open a PR, get CI green, merge, and confirm "E2E on production" is green. Finish with a short report: what ran, what passed, what you fixed, and what only a real device can confirm.
