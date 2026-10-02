/**
 * Phase 2 full loop on real browsers: start → title card → a Would You Rather round (with a refresh
 * mid-vote) → reveal → the Drink takeover on the right phone → end → results → rematch.
 * And a Reaction Shotgun round with a synced flash. Game timers run 2.5x faster (TIME_SCALE).
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function phone(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  return ctx.newPage();
}

async function joinAs(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Tap In' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

/** Host + 2 guests in a lobby with only `keep` of the two ready games switched on. */
async function room(browser: Browser, contexts: BrowserContext[], drop: string): Promise<Page[]> {
  const host = await phone(browser, contexts);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create Room' }).click();
  await expect(host).toHaveURL(/\/[A-HJ-NP-Z]{4}$/);
  const code = new URL(host.url()).pathname.slice(1);
  await joinAs(host, 'Brett');
  const phones = [host];
  for (const name of ['Priya', 'Marco']) {
    const p = await phone(browser, contexts);
    await p.goto(`/${code}`);
    await joinAs(p, name);
    phones.push(p);
  }
  await host.getByRole('button', { name: 'Edit settings' }).click();
  await host.getByRole('switch', { name: drop }).click();
  await expect(host.getByRole('switch', { name: drop })).toHaveAttribute('aria-checked', 'false');
  await host.getByRole('button', { name: 'Close' }).click();
  await host.getByRole('button', { name: 'Start!' }).click();
  for (const p of phones) await expect(p.getByTestId('in-game')).toBeVisible();
  return phones;
}

test('Would You Rather: vote, refresh mid-vote, reveal, Drink, end, rematch', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    const [host, priya, marco] = (await room(browser, contexts, 'Reaction Shotgun')) as [
      Page,
      Page,
      Page,
    ];
    await expect(host.getByTestId('title-card')).toBeVisible();
    await expect(host.getByRole('heading', { name: 'Would You Rather' })).toBeVisible();

    for (const p of [host, priya, marco]) {
      await expect(p.getByTestId('wouldYouRather-input')).toBeVisible({ timeout: 15_000 });
      await expect(p.getByText('Round 1 of 4')).toBeVisible();
    }
    await host.locator('.wyr-a').click();
    await priya.locator('.wyr-a').click();
    await expect(host.getByText('2 of 3 locked in')).toBeVisible();

    // Priya refreshes mid-vote: she's straight back in with her pick restored.
    await priya.reload();
    await expect(priya.locator('.wyr-a')).toHaveAttribute('aria-pressed', 'true');

    // Marco is alone on B: the smaller side drinks.
    await marco.locator('.wyr-b').click();
    await expect(host.getByTestId('wouldYouRather-reveal')).toBeVisible();
    await expect(marco.getByTestId('drink-you')).toBeVisible();
    await expect(marco.getByRole('heading', { name: 'DRINK' })).toBeVisible();
    await expect(host.getByTestId('drink-other')).toBeVisible();
    await expect(host.getByText('Marco')).toBeVisible();
    await marco.getByRole('button', { name: /Done/ }).click();
    await expect(marco.getByText('Cheers!')).toBeVisible();

    // Round 2 starts; the host wraps up from the menu.
    await expect(host.getByText('Round 2 of 4')).toBeVisible({ timeout: 15_000 });
    await host.getByRole('button', { name: 'Menu' }).click();
    await host.getByRole('button', { name: 'End game → results' }).click();
    for (const p of [host, priya, marco]) await expect(p.getByTestId('results')).toBeVisible();
    await expect(marco.locator('.standing').first()).toContainText('Marco');
    await expect(host.getByText('Most drinks')).toBeVisible();

    await host.getByRole('button', { name: /Rematch/ }).click();
    for (const p of [host, priya, marco]) {
      await expect(p.getByTestId('in-game')).toHaveAttribute('data-phase', /intro|gameIntro/);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Reaction Shotgun: synced flash, taps, leaderboard', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Would You Rather');
    const [host] = phones as [Page];
    for (const p of phones)
      await expect(p.getByTestId('shotgun-pad')).toBeVisible({ timeout: 15_000 });
    // Tap everyone the moment their own phone flashes.
    await Promise.all(
      phones.map(async (p) => {
        await expect(p.getByText('TAP!')).toBeVisible({ timeout: 15_000 });
        await p.getByTestId('shotgun-pad').dispatchEvent('pointerdown');
      }),
    );
    await expect(host.getByTestId('reactionShotgun-reveal')).toBeVisible();
    await expect(host.locator('.board-row')).toHaveCount(3);
    await expect(host.locator('.board-ms').first()).toHaveText(/\d+ ms|EARLY/);
    await expect(host.getByTestId(/drink-/)).toBeVisible({ timeout: 15_000 });
  } finally {
    for (const c of contexts) await c.close();
  }
});
