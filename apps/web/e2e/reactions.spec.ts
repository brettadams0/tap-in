/**
 * Reactions (DESIGN §12) on real browsers, in the lobby: an emoji everyone sees, a note whose words
 * only the recipient sees, and mute.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { joinAs, phone, tap } from './helpers.js';

/** Opt-in screenshots for reviewing screens by eye: E2E_SHOTS=<dir>. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.bringToFront();
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test('reactions: emoji for all, note words only for the recipient, mute', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const host = await phone(browser, contexts);
    await host.goto('/');
    await host.getByRole('button', { name: 'Create Room' }).click();
    await expect(host).toHaveURL(/\/[A-HJ-NP-Z]{4}$/);
    const code = new URL(host.url()).pathname.slice(1);
    await joinAs(host, 'Brett');
    const phones: Page[] = [host];
    for (const name of ['Priya', 'Marco']) {
      const p = await phone(browser, contexts);
      await p.goto(`/${code}`);
      await joinAs(p, name);
      phones.push(p);
    }
    const [, priya, marco] = phones as [Page, Page, Page];

    await test.step('an emoji flies for everyone', async () => {
      await tap(priya, priya.getByRole('button', { name: 'React to Marco' }));
      await tap(priya, priya.getByRole('button', { name: '🔥' }));
      await expect(marco.locator('.react-sticker')).toContainText('🔥');
      await shot(marco, 'react-lobby-sticker');
      await expect(host.locator('.react-flight')).toContainText('Priya');
    });

    await test.step("a note's words stay between the two of them", async () => {
      await host.waitForTimeout(3200); // the 3 s rate limit
      await tap(priya, priya.getByRole('button', { name: 'React to Marco' }));
      await tap(priya, priya.getByRole('tab', { name: 'Kind' }));
      const line = priya.locator('.react-line-btn').first();
      await shot(priya, 'react-sheet');
      const words = (await line.textContent()) ?? '';
      await line.click();
      await expect(marco.locator('.react-sticker')).toContainText(words, { timeout: 10_000 });
      await expect(host.getByText(words)).toHaveCount(0);
      await expect(host.locator('.react-flight')).toContainText('💌');
    });

    await test.step('a muted sender never shows up', async () => {
      await tap(marco, marco.getByRole('button', { name: 'React to Priya' }));
      await tap(marco, marco.getByRole('button', { name: 'Mute Priya' }));
      await tap(marco, marco.getByRole('button', { name: 'Close' }));
      await host.waitForTimeout(4500);
      await tap(priya, priya.getByRole('button', { name: 'React to Marco' }));
      await tap(priya, priya.getByRole('button', { name: '😘' }));
      await expect(host.locator('.react-flight')).toContainText('😘');
      await expect(marco.locator('.react-sticker')).toHaveCount(0);
    });
  } finally {
    for (const c of contexts) await c.close();
  }
});
