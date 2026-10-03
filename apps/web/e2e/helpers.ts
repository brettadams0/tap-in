/** Shared helpers for the game e2e specs: phones, taps that work on CI WebKit, and a lobby. */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { GAME_NAMES, READY_GAMES } from '@tap-in/shared';

export async function phone(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  return ctx.newPage();
}

/**
 * Click as that phone. Headless WebKit throttles animation frames on pages that aren't in front,
 * and Playwright's "element is stable" check waits on those frames, so bring the phone forward first.
 */
export async function tap(
  page: Page,
  selector: string | ReturnType<Page['getByRole']>,
): Promise<void> {
  await page.bringToFront();
  await (typeof selector === 'string' ? page.locator(selector) : selector).click();
}

export async function joinAs(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Tap In' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

/** Host + 2 guests in a lobby where `keep` is the only playable game switched on, then Start. */
export async function room(
  browser: Browser,
  contexts: BrowserContext[],
  keep: string,
): Promise<Page[]> {
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
  for (const id of READY_GAMES) {
    const name = GAME_NAMES[id];
    if (name === keep) continue;
    const toggle = host.getByRole('switch', { name });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  }
  await host.getByRole('button', { name: 'Close' }).click();
  await host.getByRole('button', { name: 'Start!' }).click();
  for (const p of phones) await expect(p.getByTestId('in-game')).toBeVisible();
  return phones;
}
