# Tap In

A party drinking game for 3–8 people (built for 5), each on their own phone. There's no TV, no app and no logins. Open a link, tap in, and a rotating party mix of mini-games tells the losers to **Drink**.

- **Spec:** [SPEC.md](./SPEC.md)
- **Plan:** [PLAN.md](./PLAN.md)
- **Design:** [DESIGN.md](./DESIGN.md)
- **Decisions:** [DECISIONS.md](./DECISIONS.md)
- **Progress:** [PROGRESS.md](./PROGRESS.md)
- **Testing:** [TESTING.md](./TESTING.md)

## Repo layout

```
apps/web        Vite + React client (Vercel project "tap-in")
apps/server     Room server: Cloudflare Worker + Durable Object "Room" (and a Node adapter for tests/dev)
packages/shared Protocol types, Zod schemas, clock sync, seeded RNG, room codes, names, avatars, view diff
packages/games  Pure mini-game modules (logic + tests), the registry and the content validator
content/        Prompt banks (JSON, spice-tagged; server-side only)
```

## Run it locally

Requires Node 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm --filter @tap-in/server dev     # room server on http://localhost:8787 (Node adapter)
pnpm --filter @tap-in/web dev        # client on http://localhost:5173
```

To test with phones on the same Wi-Fi, open `http://<your-laptop-ip>:5173`. The client talks to port 8787 on the same host by default.

To run the real Cloudflare runtime locally instead of the Node adapter, use `pnpm --filter @tap-in/server dev:worker` (wrangler dev, port 8787).

## Checks

```bash
pnpm lint            # ESLint (strict, type-checked)
pnpm format:check    # Prettier
pnpm typecheck
pnpm test            # unit + real-socket integration + workerd Durable Object tests, with coverage gates
pnpm e2e             # Playwright: 5 phones on WebKit (iPhone 14) + Chromium (Pixel 7)
```

## Environment variables

| Where                         | Name                      | What                                                                                                                        |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Vercel (client)               | `VITE_SERVER_URL`         | Room server base URL, e.g. `https://tap-in-server.<your-subdomain>.workers.dev`                                             |
| Worker (`wrangler.toml` vars) | `ALLOWED_ORIGINS`         | Comma-separated browser origins allowed to connect. `https://tap-in.vercel.app` also allows `tap-in-*.vercel.app` previews. |
| GitHub Actions secret         | `CLOUDFLARE_API_TOKEN`    | API token with the "Edit Cloudflare Workers" template                                                                       |
| GitHub Actions secret         | `CLOUDFLARE_ACCOUNT_ID`   | Your Cloudflare account ID                                                                                                  |
| GitHub Actions variable       | `SERVER_URL`              | Same as `VITE_SERVER_URL`; used for the post-deploy health check                                                            |
| Local dev (Node adapter)      | `PORT`, `ALLOWED_ORIGINS` | Defaults: `8787`, `*`                                                                                                       |
| Local dev / e2e (Node only)   | `TIME_SCALE`              | Speeds up game timers, e.g. `0.4` (e2e default). Never set in production.                                                   |

No secrets ever go into the client bundle.

## Deploy

### Room server: Cloudflare Workers (free plan)

One-time setup:

1. Create a free account at <https://dash.cloudflare.com/sign-up> and pick a `workers.dev` subdomain (Workers & Pages → Overview).
2. Go to **My Profile → API Tokens → Create Token** and choose the **Edit Cloudflare Workers** template. Copy the token.
3. Copy your **Account ID** from the Workers & Pages overview sidebar.
4. In GitHub, go to **repo → Settings → Secrets and variables → Actions** and add:
   - secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
   - variable `SERVER_URL` = `https://tap-in-server.<subdomain>.workers.dev`

After that, every green CI run on `main` deploys the Worker (`.github/workflows/deploy-server.yml`). You can also run it by hand from the Actions tab ("Deploy room server" → Run workflow), or locally with `pnpm --filter @tap-in/server deploy`.

### Client: Vercel (Hobby)

One-time setup in the Vercel dashboard:

1. **Add New → Project → Import** `brettadams0/tap-in`.
2. Set **Root Directory** to `apps/web`. The framework (Vite) and the build settings come from `apps/web/vercel.json`.
3. Under **Environment Variables**, add `VITE_SERVER_URL` = your Worker URL (Production and Preview).
4. Deploy. Every push then deploys automatically: `main` goes to production, and other branches and PRs get preview URLs.

If the project URL isn't `https://tap-in.vercel.app` (the name may be taken), add the real URL to `ALLOWED_ORIGINS` in `apps/server/wrangler.toml`.

## Privacy

There are no accounts and no analytics. Room state, including anything typed during a game, lives only in that room's Durable Object storage and is deleted when the room expires (30 minutes with nobody connected).
