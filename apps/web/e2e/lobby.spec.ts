/**
 * Phase 1 happy path with 5 phones: create, join by code and by link, live lobby,
 * refresh restores the seat, start locks the lobby, claim a seat from a new phone.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function phone(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  return ctx.newPage();
}

function at<T>(items: T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`no item ${i}`);
  return item;
}

async function joinAs(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Build your cap' })).toBeVisible();
  await page.getByRole('button', { name: 'Tap In' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

test('5 phones: create, join by code and link, refresh, start, claim a seat', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    // Host creates the room.
    const host = await phone(browser, contexts);
    await host.goto('/');
    await expect(host.getByRole('heading', { name: 'Tap In!' })).toBeVisible();
    await host.getByRole('button', { name: 'Create Room' }).click();
    await expect(host).toHaveURL(/\/[A-HJ-NP-Z]{4}$/);
    const code = new URL(host.url()).pathname.slice(1);
    await joinAs(host, 'Brett');
    await expect(host.getByTestId('room-code')).toHaveText(code);
    await expect(host.getByRole('button', { name: 'Start!' })).toBeDisabled();

    // Two join by typing the code, two by opening the link.
    const guests: Page[] = [];
    for (const [i, name] of ['Priya', 'Marco', 'Jules', 'Dee'].entries()) {
      const p = await phone(browser, contexts);
      if (i < 2) {
        await p.goto('/');
        await p.getByLabel('Room code').fill(code.toLowerCase());
        await p.getByRole('button', { name: 'Join' }).click();
      } else {
        await p.goto(`/${code}`);
      }
      await joinAs(p, name);
      guests.push(p);
    }

    for (const p of [host, ...guests]) {
      await expect(p.getByRole('heading', { name: /Players · 5\/8/ })).toBeVisible();
    }
    await expect(at(guests, 0).getByText('Waiting for Brett to start…')).toBeVisible();

    // Host changes a setting: everyone sees it live.
    await host.getByRole('button', { name: 'Edit settings' }).click();
    await host.getByRole('button', { name: 'Spicy' }).click();
    await host.getByRole('button', { name: 'Close' }).click();
    await expect(at(guests, 3).getByText('Spicy', { exact: true })).toBeVisible();

    // Refresh mid-lobby: straight back into the same seat, no join form.
    const marco = at(guests, 1);
    await marco.reload();
    await expect(marco.getByTestId('room-code')).toBeVisible();
    await expect(marco.getByRole('button', { name: 'Marco (you)' })).toBeVisible();

    // Start locks the lobby.
    await host.getByRole('button', { name: 'Start!' }).click();
    for (const p of [host, ...guests]) await expect(p.getByTestId('in-game')).toBeVisible();

    // Refresh mid-game returns to the same screen.
    await at(guests, 2).reload();
    await expect(at(guests, 2).getByTestId('in-game')).toBeVisible();

    // Dee's phone dies; a new phone claims Dee's seat and the host lets her in.
    await at(contexts, 4).close();
    const newPhone = await phone(browser, contexts);
    await newPhone.goto(`/${code}`);
    await expect(
      newPhone.getByRole('heading', { name: 'This game already started' }),
    ).toBeVisible();
    await newPhone.getByRole('button', { name: 'Dee' }).click();
    await expect(newPhone.getByText('Knock knock…')).toBeVisible();
    await host.getByRole('button', { name: 'Let in' }).click();
    await expect(newPhone.getByTestId('in-game')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
  }
});

test('unknown room shows the ended screen with a way out', async ({ page }) => {
  await page.goto('/QQQQ');
  await expect(page.getByRole('heading', { name: 'This room has ended' })).toBeVisible();
  await page.getByRole('button', { name: 'Create New Room' }).click();
  await expect(page).toHaveURL(/\/$/);
});
