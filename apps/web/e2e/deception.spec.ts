/**
 * Phase 3 on real browsers: one round of each deception game with 3 phones, from typing to the
 * reveal and the Drink moment. Covers the inline "too close" rejection and a refresh mid-setup.
 * Game timers run 2.5x faster (TIME_SCALE).
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

const step = (p: Page) => p.locator('main.play').getAttribute('data-step');

async function waitStep(phones: Page[], gameId: string, s: string): Promise<void> {
  for (const p of phones) {
    await expect(p.getByTestId(`${gameId}-input`)).toHaveAttribute('data-step', s, {
      timeout: 25_000,
    });
  }
}

async function type(page: Page, label: string | RegExp, text: string): Promise<void> {
  await page.bringToFront();
  await page.getByLabel(label).fill(text);
  await page.getByRole('button', { name: /Lock it in|Guess!/ }).click();
}

/** Ends on the Drink moment on every phone. */
async function expectDrink(phones: Page[], name?: string): Promise<void> {
  for (const p of phones) await expect(p.getByTestId(/^drink-/)).toBeVisible({ timeout: 25_000 });
  if (name) for (const [i, p] of phones.entries()) await shot(p, `${name}-drink-${i}`);
}

test("Liar's Prompt: answer, the synced show, vote, unmask", async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, "Liar's Prompt");
    await waitStep(phones, 'liarsPrompt', 'answer');
    for (const p of phones) await expect(p.getByText('Your question')).toBeVisible();
    await shot(phones[0] as Page, 'liar-1-answer');
    for (const [i, p] of phones.entries()) await type(p, 'Your answer', `Answer ${i + 1}`);
    await waitStep(phones, 'liarsPrompt', 'show');
    await expect((phones[0] as Page).getByText('Answer 3')).toBeVisible({ timeout: 10_000 });
    await shot(phones[1] as Page, 'liar-2-show');
    await waitStep(phones, 'liarsPrompt', 'vote');
    await shot(phones[0] as Page, 'liar-3-vote');
    for (const p of phones) await expect(p.getByText('The real question was')).toBeVisible();
    // Everyone votes for the next phone round the table.
    for (const p of phones) {
      await tap(p, p.locator('.pick').first());
    }
    for (const p of phones) await expect(p.getByTestId('liarsPrompt-reveal')).toBeVisible();
    await expect((phones[0] as Page).getByText('The imposter was')).toBeVisible();
    await shot(phones[0] as Page, 'liar-4-reveal');
    await expectDrink(phones, 'liar');
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Secret Word: hints in turn, a blocked hint, vote', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Secret Word');
    await waitStep(phones, 'secretWord', 'hint');
    const outsiders = await Promise.all(
      phones.map((p) => p.getByText("You're the outsider").isVisible()),
    );
    expect(outsiders.filter(Boolean)).toHaveLength(1);
    // Each turn: whoever has the hint box gives a hint. The first insider tries the word itself.
    await shot(phones[0] as Page, 'secret-1-hint');
    let blocked = false;
    for (let turn = 0; turn < 3; turn++) {
      let found = false;
      for (const p of phones) {
        await p.bringToFront();
        const box = p.getByLabel('Your turn: one word');
        if (!(await box.isVisible())) continue;
        found = true;
        const word = p.locator('.secret-word');
        if (!blocked && !(await p.getByText("You're the outsider").isVisible())) {
          await type(p, 'Your turn: one word', (await word.textContent()) ?? '');
          await expect(p.getByRole('alert').filter({ hasText: 'Too close' })).toBeVisible();
          await shot(p, 'secret-2-blocked');
          blocked = true;
        }
        await type(p, 'Your turn: one word', ['zebra', 'kettle', 'orbit'][turn] ?? 'x');
        await expect(box).toBeHidden();
        break;
      }
      if (!found) {
        await phones[0]?.waitForTimeout(500);
        turn--;
      }
    }
    expect(blocked).toBe(true);
    await waitStep(phones, 'secretWord', 'vote');
    await expect((phones[0] as Page).getByText('kettle')).toBeVisible();
    await shot(phones[0] as Page, 'secret-3-vote');
    for (const p of phones) await tap(p, p.locator('.pick').first());
    // Either a reveal, or the caught outsider's guess first. Wait for the vote to really end:
    // on production timers a skipped guess would run its full 20 s before the reveal.
    await expect(
      (phones[0] as Page).locator(
        '[data-testid="secretWord-reveal"], [data-testid="secretWord-input"][data-step="guess"]',
      ),
    ).toBeVisible({ timeout: 25_000 });
    if ((await step(phones[0] as Page)) === 'guess') {
      const outsider = phones[outsiders.indexOf(true)] as Page;
      await expect(outsider.getByLabel('Your guess')).toBeVisible();
      await type(outsider, 'Your guess', 'banana');
    }
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Two Truths, One App: setup with a reroll and a refresh, then spot the fake', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Two Truths, One App');
    const [host] = phones as [Page];
    await waitStep(phones, 'twoTruths', 'setup');
    await shot(host, 'truths-1-setup');
    const fake = host.locator('.fact.is-fake');
    const before = await fake.textContent();
    await tap(host, host.getByRole('button', { name: /true for me/ }));
    await expect(fake).not.toHaveText(before ?? '');
    await expect(host.getByRole('button', { name: /1 left/ })).toBeVisible();
    // A refresh mid-setup brings back the same fake and reroll count.
    const rerolled = await fake.textContent();
    await host.reload();
    await expect(host.locator('.fact.is-fake')).toHaveText(rerolled ?? '');
    await expect(host.getByRole('button', { name: /1 left/ })).toBeVisible();

    for (const [i, p] of phones.entries()) {
      await p.bringToFront();
      await p.getByLabel('Two true things about you').fill(`I own ${i + 2} kayaks`);
      await p.getByLabel('True thing #2').fill(`I can whistle ${i + 2} songs`);
      await p.getByRole('button', { name: 'Lock it in' }).click();
    }
    await waitStep(phones, 'twoTruths', 'guess');
    await shot(phones[1] as Page, 'truths-2-guess');
    for (const p of phones) {
      const cards = p.locator('.fact-btn:enabled');
      if ((await cards.count()) > 0) await tap(p, cards.first());
    }
    for (const p of phones) await expect(p.getByTestId('twoTruths-reveal')).toBeVisible();
    await expect(host.locator('.fact .stamp', { hasText: 'FAKE' })).toBeVisible();
    await shot(host, 'truths-3-reveal');
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('Fake Answer: write fakes, pick the real one, cards reveal', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const phones = await room(browser, contexts, 'Fake Answer');
    await waitStep(phones, 'fakeAnswer', 'write');
    await shot(phones[0] as Page, 'fake-1-write');
    for (const [i, p] of phones.entries()) {
      await type(p, 'Your fake answer', ['Glow sticks', 'A pet rock', 'Rubber chickens'][i] ?? 'x');
    }
    await waitStep(phones, 'fakeAnswer', 'vote');
    await shot(phones[0] as Page, 'fake-2-vote');
    for (const p of phones) {
      await expect(p.locator('.option')).toHaveCount(4);
      await expect(p.locator('.option .tag', { hasText: 'yours' })).toHaveCount(1);
      await tap(p, p.locator('.option:enabled').first());
    }
    for (const p of phones) await expect(p.getByTestId('fakeAnswer-reveal')).toBeVisible();
    await expect((phones[0] as Page).locator('.stamp-real')).toBeVisible();
    await shot(phones[0] as Page, 'fake-3-reveal');
    await expectDrink(phones);
  } finally {
    for (const c of contexts) await c.close();
  }
});
