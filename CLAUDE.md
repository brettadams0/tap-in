# Tap In: notes for Claude

Start with [HANDOFF.md](./HANDOFF.md): current state, next work, how to add a game, gotchas. Source of truth: [SPEC.md](./SPEC.md). Phase task lists: [PLAN.md](./PLAN.md). Recorded choices: [DECISIONS.md](./DECISIONS.md).

- Before pushing: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`.
- e2e in the Claude cloud sandbox: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 pnpm e2e` (WebKit runs in CI only).
- The Drink instruction is only ever the word "Drink". No amounts.
- Readable > playable > fun. Nothing may cover the status or action zones.
- Every open choice goes into DECISIONS.md with a one-line reason; update PROGRESS.md at the end of each phase.
