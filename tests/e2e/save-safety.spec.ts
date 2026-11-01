/**
 * QA (P2 review): the app's ProfileStore with real browser storage. A Phase 1 browser, a garbage
 * save and a save from a newer build must boot to a playable menu without page errors, and must
 * never destroy data without a backup.
 */
import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, entries: Record<string, string>): Promise<void> {
  // Seed once per test (init scripts also run on reloads).
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('qa-seeded')) return;
    sessionStorage.setItem('qa-seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
  }, entries);
}

const ls = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k);
const status = (page: Page) => page.evaluate('window.__themProfile?.loadStatus');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('Phase 1 browser (best, lang, settings; no save): new profile, Phase 1 keys kept', async ({ page }) => {
  const best = '{"grade":"A","score":1420}';
  await seed(page, { 'them.best': best, 'them.lang': 'en', 'them.settings': '{}' });
  await page.goto('/');
  await expect.poll(() => status(page)).toBe('empty');
  await expect(page.getByTestId('menu-camp')).toBeEnabled();
  await expect.poll(() => ls(page, 'them.save')).toContain('"format":"them.save"');
  expect(await ls(page, 'them.best')).toBe(best);
  expect(await ls(page, 'them.lang')).toBe('en');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('hud-wave')).toBeVisible();
});

test('garbage save: boots, raw text backed up, playable', async ({ page }) => {
  await seed(page, { 'them.save': '{"format":"them.save","version":3,"profile":{oops' });
  await page.goto('/');
  await expect.poll(() => status(page)).toBe('corrupt');
  expect(await ls(page, 'them.save.corrupt')).toBe('{"format":"them.save","version":3,"profile":{oops');
  await expect.poll(() => ls(page, 'them.save')).toContain('"format":"them.save"');
  await expect(page.getByTestId('menu-camp')).toBeEnabled();
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('hud-wave')).toBeVisible();
});

test('save from a newer build: never overwritten, Camp disabled, run still playable', async ({ page }) => {
  const raw = JSON.stringify({ format: 'them.save', version: 99, savedAt: 1, profile: { future: true } });
  await seed(page, { 'them.save': raw });
  await page.goto('/');
  await expect.poll(() => status(page)).toBe('newer');
  await expect(page.getByTestId('menu-camp')).toBeDisabled();
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('hud-wave')).toBeVisible();
  expect(await ls(page, 'them.save')).toBe(raw);
});
