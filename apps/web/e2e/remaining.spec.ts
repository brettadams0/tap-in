/**
 * Phase 4 on real browsers: one round of Rank It, Tap Race, Spin the Bottle, Fill in the Blank and
 * Countdown with 3 phones, from input to the reveal and the Drink moment. Game timers run 2.5x
 * faster (TIME_SCALE); Tap Race's 5 s window and Countdown's collision window are never scaled.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { room, tap } from './helpers.js';

test.describe.configure({ timeout: 150_000 });

/** Opt-in screenshots for reviewing screens by eye: E2E_SHOTS=<dir>. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.bringToFront();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function inputOn(phones: Page[], gameId: string, step?: string): Promise<void> {
  for (const p of phones) {
    const screen = p.getByTestId(`${gameId}-input`);
    await expect(screen).toBeVisible({ timeout: 25_000 });
    if (step) await expect(screen).toHaveAttribute('data-step', step, { timeout: 25_000 });
  }
}

async function expectDrink(phones: Page[]): Promise<void> {
  for (const p of phones) await expect(p.getByTestId(/^drink-/)).toBeVisible({ timeout: 25_000 });
}

test('Rank It: tap in order, lock in, the group order lands', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Rank It');
    await inputOn(phones, 'rankIt');
    const [host] = phones as [Page];
    await shot(host, 'rank-1-input');
    for (const [i, p] of phones.entries()) {
      // Tap the last row first, so each phone ranks differently.
      const rows = p.locator('.rank-row');
      await tap(p, rows.nth(i === 0 ? 0 : 3));
      await tap(p, p.getByRole('button', { name: 'Lock it in' }));
    }
    for (const p of phones) await expect(p.getByTestId('rankIt-reveal')).toBeVisible();
    await expect(host.locator('.bar-row')).toHaveCount(3);
    await shot(host, 'rank-2-reveal');
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Tap Race: 3-2-1, hammer the pad, bars race', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Tap Race');
    await inputOn(phones, 'tapRace');
    await shot(phones[0] as Page, 'tap-1-countdown');
    await Promise.all(
      phones.map(async (p, i) => {
        const pad = p.getByTestId('tap-pad');
        await expect(pad).toHaveClass(/is-live/, { timeout: 15_000 });
        for (let n = 0; n < 5 + i * 5; n++) await pad.dispatchEvent('pointerdown');
      }),
    );
    for (const p of phones) await expect(p.getByTestId('tapRace-reveal')).toBeVisible();
    const host = phones[0] as Page;
    await expect(host.locator('.bar-n').first()).toHaveText('15');
    await shot(host, 'tap-2-reveal');
    await expectDrink(phones);
    await expect(host.getByTestId('drink-you')).toBeVisible();
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Spin the Bottle: lands, Dare, done, the room says Done', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Spin the Bottle');
    await inputOn(phones, 'spinTheBottle', 'spin');
    await shot(phones[0] as Page, 'spin-1-spin');
    await inputOn(phones, 'spinTheBottle', 'choice');
    const chosen = await Promise.any(
      phones.map(async (p) => {
        await expect(p.getByRole('button', { name: 'Dare!' })).toBeVisible({ timeout: 5000 });
        return p;
      }),
    );
    await shot(chosen, 'spin-2-choice');
    await tap(chosen, chosen.getByRole('button', { name: 'Dare!' }));
    await tap(chosen, chosen.getByRole('button', { name: /I did it/ }));
    for (const p of phones) {
      if (p === chosen) continue;
      await tap(p, p.getByRole('button', { name: /Done/ }));
    }
    for (const p of phones) await expect(p.getByTestId('spinTheBottle-reveal')).toBeVisible();
    await expect(chosen.getByText('Dare done!')).toBeVisible();
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Fill in the Blank: write, vote for a favourite, authors revealed', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Fill in the Blank');
    await inputOn(phones, 'fillInTheBlank', 'write');
    for (const [i, p] of phones.entries()) {
      await p.bringToFront();
      await p
        .getByLabel('Fill the blank')
        .fill(['A goose in a tux', 'Tax forms', 'Wet socks'][i] ?? 'x');
      await p.getByRole('button', { name: 'Lock it in' }).click();
    }
    await inputOn(phones, 'fillInTheBlank', 'vote');
    await shot(phones[0] as Page, 'blank-1-vote');
    for (const p of phones) await tap(p, p.locator('.option:enabled').first());
    for (const p of phones) await expect(p.getByTestId('fillInTheBlank-reveal')).toBeVisible();
    await shot(phones[0] as Page, 'blank-2-reveal');
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Countdown: count to the target together', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Countdown');
    await inputOn(phones, 'countdown');
    const host = phones[0] as Page;
    await shot(host, 'count-1-input');
    for (let n = 0; n < 6; n++) {
      const p = phones[n % 3] as Page;
      const btn = p.getByTestId('count-btn');
      await expect(btn).toBeEnabled();
      await p.bringToFront();
      await btn.dispatchEvent('pointerdown');
      await expect(host.locator('.count-num')).toHaveText(String(n + 1));
      await host.waitForTimeout(700);
    }
    for (const p of phones) await expect(p.getByTestId('countdown-reveal')).toBeVisible();
    await expect(host.getByText('COUNTED IT!')).toBeVisible();
    await expectDrink(phones);
    await expect(host.getByTestId('drink-nobody')).toBeVisible();
  } finally {
    for (const c of contexts) await c.close();
  }
});
