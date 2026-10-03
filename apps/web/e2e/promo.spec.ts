/**
 * Promo screenshots (not a test): five phones play real-speed rounds with hand-picked answers,
 * and the best frames are saved for advertising. Opt-in, never in CI:
 *
 *   PROMO_DIR=/abs/dir PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PW_SKIP_WEBKIT=1 \
 *     pnpm --filter @tap-in/web exec playwright test e2e/promo.spec.ts
 *
 * Needs the Node test server (it uses the `?roundsPerGame=1&timeScale=1` hooks).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { GAME_IDS, GAME_NAMES, type GameId } from '@tap-in/shared';
import { joinAs, phone, tap } from './helpers.js';

const DIR = process.env.PROMO_DIR;
test.skip(!DIR || !!process.env.E2E_BASE_URL, 'set PROMO_DIR (local Node server only)');
test.describe.configure({ timeout: 4 * 60_000 });

const NAMES = ['Brett', 'Priya', 'Marco', 'Jules', 'Dee'];

/** Promo polish: the live address instead of localhost, and no last-5-seconds red edge. */
async function polish(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.urgent-vignette { display: none !important; }' });
  await page.evaluate((origin) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes(origin))
        n.textContent = n.textContent.replace(origin, 'tap-in-omega.vercel.app');
    }
  }, new URL(page.url()).host);
}

async function shot(page: Page, name: string, settle = 600): Promise<void> {
  await page.bringToFront();
  await page.waitForTimeout(settle);
  await polish(page);
  await page.screenshot({ path: `${DIR ?? '.'}/${name}.png` });
}

/** Answers that fit whatever question Liar's Prompt dealt (falls back to crowd-pleasers). */
const ANSWERS: [RegExp, string[]][] = [
  [/fruit/i, ['Mango', 'Banana', 'Strawberry', 'Kiwi', 'Pineapple']],
  [/animal|zoo|farm/i, ['Goat', 'Penguin', 'Llama', 'Cow', 'Goose']],
  [/pizza|topping/i, ['Pepperoni', 'Mushrooms', 'Pineapple', 'Olives', 'Extra cheese']],
  [/colou?r/i, ['Red', 'Teal', 'Purple', 'Orange', 'Gold']],
  [/sport|ice/i, ['Hockey', 'Curling', 'Soccer', 'Tennis', 'Skating']],
  [/country|city|destination/i, ['Iceland', 'Japan', 'Portugal', 'Mexico', 'Montreal']],
  [/dog/i, ['Corgi', 'Pug', 'Husky', 'Poodle', 'Beagle']],
  [/song|music|karaoke/i, ['Mr. Brightside', 'Wannabe', 'Dancing Queen', 'Africa', 'Hey Ya!']],
  [/food|breakfast|snack|dessert/i, ['Pancakes', 'Poutine', 'Tacos', 'Waffles', 'Nachos']],
];
const answersFor = (question: string): string[] =>
  ANSWERS.find(([re]) => re.test(question))?.[1] ?? [
    'Karaoke',
    'A nap',
    'Pizza',
    'My mom',
    'Tuesday',
  ];

/** Host + 4 friends in one lobby, with only `gameId` switched on. */
async function room5(
  browser: Parameters<typeof phone>[0],
  contexts: BrowserContext[],
  gameId: GameId | null,
): Promise<Page[]> {
  const host = await phone(browser, contexts);
  await host.goto('/?roundsPerGame=1&timeScale=1');
  await host.getByRole('button', { name: 'Create Room' }).click();
  await expect(host).toHaveURL(/\/[A-HJ-NP-Z]{4}$/);
  const code = new URL(host.url()).pathname.slice(1);
  await joinAs(host, NAMES[0] ?? 'Host');
  const phones = [host];
  for (const name of NAMES.slice(1)) {
    const p = await phone(browser, contexts);
    await p.goto(`/${code}`);
    await joinAs(p, name);
    phones.push(p);
  }
  await expect(host.getByRole('heading', { name: /Players · 5\/8/ })).toBeVisible();
  if (gameId) {
    await host.getByRole('button', { name: 'Edit settings' }).click();
    for (const id of GAME_IDS) {
      if (id === gameId) continue;
      const toggle = host.getByRole('switch', { name: GAME_NAMES[id] });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await host.getByRole('button', { name: 'Close' }).click();
  }
  return phones;
}

async function start(phones: Page[]): Promise<void> {
  const host = phones[0] as Page;
  await tap(host, host.getByRole('button', { name: 'Start!' }));
  for (const p of phones) await expect(p.getByTestId('in-game')).toBeVisible();
}

async function input(phones: Page[], gameId: GameId): Promise<void> {
  for (const p of phones)
    await expect(p.getByTestId(`${gameId}-input`)).toBeVisible({ timeout: 30_000 });
}

async function type(p: Page, text: string): Promise<void> {
  await p.bringToFront();
  await p.getByRole('textbox').first().fill(text);
  await p.getByRole('button', { name: /Lock it in/ }).click();
}

const withPhones = (
  name: string,
  gameId: GameId | null,
  body: (phones: Page[]) => Promise<void>,
) => {
  test(name, async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    try {
      await body(await room5(browser, contexts, gameId));
    } finally {
      for (const c of contexts) await c.close();
    }
  });
};

test('home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tap In!' })).toBeVisible();
  await shot(page, '01-home', 1200);
});

withPhones('lobby and Would You Rather: vote, reveal, Drink', 'wouldYouRather', async (phones) => {
  const [host, priya, marco, jules, dee] = phones as [Page, Page, Page, Page, Page];
  await shot(host, '02-lobby');
  await start(phones);
  await expect(host.getByTestId('title-card')).toBeVisible({ timeout: 15_000 });
  await shot(host, '03-title-wyr', 900);
  await input(phones, 'wouldYouRather');
  await tap(host, '.wyr-a');
  await tap(priya, '.wyr-a');
  await tap(jules, '.wyr-a');
  await shot(marco, '04-wyr-vote');
  await tap(marco, '.wyr-b');
  await tap(dee, '.wyr-b');
  await expect(host.getByTestId('wouldYouRather-reveal')).toBeVisible({ timeout: 15_000 });
  await shot(host, '05-wyr-reveal', 1800);
  await expect(marco.getByTestId('drink-you')).toBeVisible({ timeout: 20_000 });
  await shot(marco, '06-drink-you', 900);
  await shot(host, '07-drink-other', 200);
  await tap(marco, marco.getByRole('button', { name: /Done/ }));
  await tap(dee, dee.getByRole('button', { name: /Done/ }));
  // Wrap up for the results screen with its awards.
  await tap(host, host.getByRole('button', { name: 'Menu' }));
  await tap(host, host.getByRole('button', { name: /End game/ }));
  await expect(host.getByTestId('results')).toBeVisible({ timeout: 20_000 });
  await shot(host, '08-results', 3500);
});

withPhones("Liar's Prompt: answers land one by one", 'liarsPrompt', async (phones) => {
  await start(phones);
  await input(phones, 'liarsPrompt');
  const question =
    (await (phones[0] as Page).locator('main.play .prompt').first().textContent()) ?? '';
  const answers = answersFor(question);
  await (phones[1] as Page)
    .getByRole('textbox')
    .first()
    .fill(answers[1] ?? 'Banana');
  await shot(phones[1] as Page, '09-liar-answer', 300);
  for (const [i, p] of phones.entries()) await type(p, answers[i] ?? 'Apple');
  const host = phones[0] as Page;
  await expect(host.getByTestId('liarsPrompt-input')).toHaveAttribute('data-step', 'show', {
    timeout: 15_000,
  });
  await shot(host, '10-liar-show', 5200);
  await expect(host.getByTestId('liarsPrompt-input')).toHaveAttribute('data-step', 'vote', {
    timeout: 20_000,
  });
  await shot(host, '11-liar-vote', 600);
});

withPhones('Fill in the Blank: vote for the funniest', 'fillInTheBlank', async (phones) => {
  await start(phones);
  await input(phones, 'fillInTheBlank');
  const answers = [
    'a goose with a grudge',
    'my mom reading my texts',
    'pineapple on a hot dog',
    'a karaoke duet with a moose',
    'the Wi-Fi password, wrong',
  ];
  for (const [i, p] of phones.entries()) await type(p, answers[i] ?? 'something');
  const host = phones[0] as Page;
  await expect(host.getByTestId('fillInTheBlank-input')).toHaveAttribute('data-step', 'vote', {
    timeout: 15_000,
  });
  await shot(host, '12-blank-vote', 1200);
  for (const p of phones) await tap(p, p.locator('main.play .option:enabled').first());
  await expect(host.getByTestId('fillInTheBlank-reveal')).toBeVisible({ timeout: 20_000 });
  await shot(host, '13-blank-reveal', 2500);
});

withPhones('Spin the Bottle: the bottle lands', 'spinTheBottle', async (phones) => {
  await start(phones);
  await input(phones, 'spinTheBottle');
  const host = phones[0] as Page;
  await shot(host, '14-spin', 1400);
  await expect(host.getByTestId('spinTheBottle-input')).toHaveAttribute('data-step', 'choice', {
    timeout: 20_000,
  });
  for (const p of phones) {
    if (await p.getByRole('button', { name: 'Dare!' }).isVisible()) {
      await shot(p, '15-spin-dare', 300);
      break;
    }
  }
});

withPhones('Tap Race: hammer the pad, bars race', 'tapRace', async (phones) => {
  await start(phones);
  await input(phones, 'tapRace');
  const host = phones[0] as Page;
  const pad = host.locator('.tap-pad.is-live');
  await pad.waitFor({ timeout: 20_000 });
  const box = await pad.boundingBox();
  for (let i = 0; i < 28; i++) {
    await host.touchscreen.tap((box?.x ?? 0) + 120 + (i % 5) * 20, (box?.y ?? 0) + 160);
    await host.waitForTimeout(60);
  }
  await shot(host, '16-taprace', 0);
  for (const [i, p] of phones.slice(1).entries()) {
    const live = p.locator('.tap-pad.is-live');
    if (!(await live.isVisible())) continue;
    const b = await live.boundingBox();
    for (let k = 0; k < 10 + i * 6; k++)
      await p.touchscreen.tap((b?.x ?? 0) + 100, (b?.y ?? 0) + 100);
  }
  await expect(host.getByTestId('tapRace-reveal')).toBeVisible({ timeout: 20_000 });
  await shot(host, '17-taprace-reveal', 2200);
});

withPhones('Rank It: drag to rank, the group order lands', 'rankIt', async (phones) => {
  await start(phones);
  await input(phones, 'rankIt');
  await shot(phones[2] as Page, '18-rankit', 400);
  // Everyone ranks a little differently, so the reveal has real distances.
  const orders = [
    [0, 1, 2, 3],
    [1, 0, 2, 3],
    [0, 2, 1, 3],
    [3, 2, 1, 0],
    [0, 1, 3, 2],
  ];
  for (const [i, p] of phones.entries()) {
    const items = await p.locator('.rank-text').allTextContents();
    for (const k of orders[i] ?? [0, 1, 2, 3]) {
      await p.locator('.rank-row', { hasText: items[k] ?? '' }).click();
    }
    await tap(p, p.getByRole('button', { name: 'Lock it in' }));
  }
  const host = phones[0] as Page;
  await expect(host.getByTestId('rankIt-reveal')).toBeVisible({ timeout: 20_000 });
  await shot(host, '19-rankit-reveal', 2500);
});
