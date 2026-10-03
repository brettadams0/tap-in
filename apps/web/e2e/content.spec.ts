/**
 * Phase 5: the skip-prompt flag. Two phones flag the Fill in the Blank prompt; every phone gets a
 * fresh prompt in the same round, with a short "skipped" notice.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { room, tap } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

/** Opt-in screenshots for reviewing screens by eye: E2E_SHOTS=<dir>. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.bringToFront();
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function flag(page: Page): Promise<void> {
  await tap(page, page.getByTestId('flag-prompt'));
  await tap(page, page.getByRole('button', { name: '🚩 Flag it' }));
}

test('Skip-prompt flag: two flags deal a fresh prompt', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const [host, priya, marco] = (await room(browser, contexts, 'Fill in the Blank')) as [
      Page,
      Page,
      Page,
    ];
    for (const p of [host, priya, marco]) {
      await expect(p.getByTestId('fillInTheBlank-input')).toBeVisible({ timeout: 20_000 });
      await expect(p.getByTestId('flag-prompt')).toHaveText('🚩 Skip prompt?');
    }
    const before = await marco.locator('.prompt').textContent();

    // "Never mind" flags nothing.
    await tap(host, host.getByTestId('flag-prompt'));
    await tap(host, host.getByRole('button', { name: 'Never mind' }));
    await expect(host.getByTestId('flag-prompt')).toHaveText('🚩 Skip prompt?');

    await flag(host);
    await expect(host.getByTestId('flag-prompt')).toHaveText('🚩 Flagged');
    await shot(host, 'flag-1-flagged');
    // One flag: nothing changes for anyone else.
    await expect(marco.getByTestId('flag-prompt')).toHaveText('🚩 Skip prompt?');
    await expect(marco.locator('.prompt')).toHaveText(before ?? '');

    await flag(priya);
    for (const p of [host, priya, marco]) {
      await expect(p.getByText('Skipped! Fresh one.')).toBeVisible();
      if (p === marco) await shot(p, 'flag-2-skipped');
      await expect(p.getByText('Round 1 of 3')).toBeVisible();
      await expect(p.getByTestId('flag-prompt')).toHaveText('🚩 Skip prompt?');
    }
    await expect(marco.locator('.prompt')).not.toHaveText(before ?? '');
  } finally {
    for (const c of contexts) await c.close();
  }
});
