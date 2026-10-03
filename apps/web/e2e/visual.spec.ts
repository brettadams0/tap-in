/**
 * Visual baselines (SPEC "End-to-end tests", P10/R19): the home screen and every game's
 * title card, with reduced motion and animations finished, so each capture is the settled frame.
 * Room codes, the QR, the random title-card gag and emoji (they render with the OS's emoji font)
 * are masked. Chromium only: the sandbox can't render WebKit, so its baselines couldn't be kept.
 *
 * Update after an intended visual change: `pnpm e2e e2e/visual.spec.ts --update-snapshots`.
 */
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { GAME_IDS, GAME_NAMES } from '@tap-in/shared';
import { room } from './helpers.js';

test.beforeEach(({ browserName }, info) => {
  test.skip(
    browserName !== 'chromium' ||
      info.project.name !== 'chromium-pixel' ||
      !!process.env.E2E_BASE_URL,
    'Chromium baselines, against the local build only',
  );
});
test.use({ reducedMotion: 'reduce' });

const OPTS = { maxDiffPixelRatio: 0.02, animations: 'disabled' } as const;
/** Hides the random gag and the emoji (OS font) for the capture; the layout stays. */
const STYLE_PATH = fileURLToPath(new URL('./visual.css', import.meta.url));

test('home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tap In!' })).toBeVisible();
  await expect(page).toHaveScreenshot('home.png', { ...OPTS, stylePath: STYLE_PATH });
});

for (const gameId of GAME_IDS) {
  test(`title card: ${GAME_NAMES[gameId]}`, async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    try {
      // This room runs real timers (a test hook), so the title card holds for its full 3.6 s.
      const [host] = (await room(browser, contexts, GAME_NAMES[gameId], {
        reducedMotion: 'reduce',
        query: '?timeScale=1',
      })) as [Page];
      await expect(host.locator('.tc-name')).toBeVisible();
      await expect(host.getByTestId('title-card')).toHaveScreenshot(`title-${gameId}.png`, {
        ...OPTS,
        stylePath: STYLE_PATH,
      });
    } finally {
      for (const c of contexts) await c.close();
    }
  });
}
