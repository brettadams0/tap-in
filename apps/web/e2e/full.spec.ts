/**
 * SPEC "End-to-end tests", the full happy path with 5 phones: create, join by code and by link,
 * one round of every game, the results, and a rematch. The room is created with the Node test
 * server's `?roundsPerGame=1` hook, so all eleven games fit in one run. Every phone plays with a
 * simple driver that answers whatever its screen asks for.
 *
 * Skipped against production: the hook only exists on the Node test server.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { GAME_IDS, type GameId } from '@tap-in/shared';
import { joinAs, phone, tap } from './helpers.js';

test.skip(!!process.env.E2E_BASE_URL, 'needs the Node test server (roundsPerGame hook)');
test.describe.configure({ timeout: 8 * 60_000 });

/** Whatever this phone's screen asks for right now: type, pick, tap or say Done. */
async function act(page: Page, n: number): Promise<void> {
  const field = page.locator('main.play input.entry-field:enabled, main.play textarea:enabled');
  if (await field.first().isVisible()) {
    await field
      .first()
      .fill(`answer ${String(n)}`)
      .catch(() => undefined);
    await page
      .getByRole('button', { name: /Lock it in|Guess!/ })
      .first()
      .click({ timeout: 800, force: true })
      .catch(() => undefined);
    return;
  }
  const targets = [
    '.wyr-card:enabled',
    'main.play .pick:enabled',
    'main.play .option:enabled',
    'main.play .fact-btn:enabled',
    '.tap-pad.is-live',
    '[data-testid="count-btn"]:enabled',
    'main .btn-primary:enabled',
  ];
  for (const selector of targets) {
    const target = page.locator(selector).first();
    if (await target.isVisible()) {
      await target.click({ timeout: 800, force: true }).catch(() => undefined);
      return;
    }
  }
}

const gameOf = async (page: Page): Promise<GameId | null> => {
  const id = await page
    .locator('main.play')
    .getAttribute('data-testid', { timeout: 200 })
    .catch(() => null);
  return (id?.replace(/-(input|reveal)$/, '') as GameId | undefined) ?? null;
};

test('5 phones: create, join by code and link, one round of every game, results, rematch', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    const host = await phone(browser, contexts);
    await host.goto('/?roundsPerGame=1');
    await host.getByRole('button', { name: 'Create Room' }).click();
    await expect(host).toHaveURL(/\/[A-HJ-NP-Z]{4}$/);
    const code = new URL(host.url()).pathname.slice(1);
    await joinAs(host, 'Brett');
    const phones = [host];
    for (const [i, name] of ['Priya', 'Marco', 'Jules', 'Dee'].entries()) {
      const p = await phone(browser, contexts);
      if (i < 2) {
        await p.goto('/');
        await p.getByLabel('Room code').fill(code);
        await p.getByRole('button', { name: 'Join' }).click();
      } else {
        await p.goto(`/${code}`);
      }
      await joinAs(p, name);
      phones.push(p);
    }
    for (const p of phones) {
      await expect(p.getByRole('heading', { name: /Players · 5\/8/ })).toBeVisible();
    }

    // Every game on (the default) and a long session, so the rotation visits all eleven.
    await host.getByRole('button', { name: 'Edit settings' }).click();
    await host.getByRole('button', { name: 'Long' }).click();
    await host.getByRole('button', { name: 'Close' }).click();
    await tap(host, host.getByRole('button', { name: 'Start!' }));
    for (const p of phones) await expect(p.getByTestId('in-game')).toBeVisible();

    const seen = new Set<GameId>();
    const deadline = Date.now() + 7 * 60_000;
    let n = 0;
    while (seen.size < GAME_IDS.length) {
      if (Date.now() > deadline) throw new Error(`only saw ${[...seen].join(', ')}`);
      const game = await gameOf(host);
      if (game) seen.add(game);
      for (const p of phones) {
        await p.bringToFront();
        await act(p, n++);
      }
    }
    expect([...seen].sort()).toEqual([...GAME_IDS].sort());

    // Wrap up from the host's menu: everyone lands on the results.
    await tap(host, host.getByRole('button', { name: 'Menu' }));
    await tap(host, host.getByRole('button', { name: /End game/ }));
    for (const p of phones) await expect(p.getByTestId('results')).toBeVisible({ timeout: 20_000 });
    await expect(host.getByRole('heading', { name: "That's a wrap!" })).toBeVisible();

    // Rematch: same room, same five players, a fresh session.
    await tap(host, host.getByRole('button', { name: /Rematch/ }));
    for (const p of phones) {
      await expect(p.getByTestId('in-game')).toHaveAttribute('data-phase', /intro|gameIntro/, {
        timeout: 20_000,
      });
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
