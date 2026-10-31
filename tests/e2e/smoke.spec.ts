import { expect, test, type Page } from '@playwright/test';

/** Read-only peek at the running session (exposed by App.tsx as window.__them). */
async function sim<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__them.session; return (${fn})(s); })()`) as Promise<T>;
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto('/?seed=7');
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('hud-wave')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('boots stage + HUD with every required readout', async ({ page }) => {
  for (const id of ['hud-hero-hp', 'hud-core-hp', 'hud-xp', 'hud-level', 'hud-wave', 'hud-timer', 'hud-wood', 'hud-stone', 'hud-score', 'hud-pause']) {
    await expect(page.getByTestId(id)).toBeAttached();
  }
  await expect(page.getByTestId('hud-wave')).toHaveText('เวฟ 1/20');
});

test('switches language th ⇄ en', async ({ page }) => {
  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('hud-wave')).toHaveText('Wave 1/20');
  await expect(page.getByTestId('prep-call-early')).toHaveText('Call wave early');
  await page.getByTestId('lang-th').click();
  await expect(page.getByTestId('prep-call-early')).toHaveText('เรียกเวฟทันที');
});

test('prep → build → call wave early → enemies spawn and sim advances', async ({ page }) => {
  await page.getByTestId('build-item-wood-wall').click();
  // Click a grid cell 2 tiles above the Core (grid is centred on the Core).
  const cell = await sim<{ x: number; y: number }>(page, `(s) => {
    const cam = window.__them.game.scene.getScene('stage').cameras.main;
    const c = s.cellCenter(4 * 13 + 6);
    return { x: (c.x - cam.worldView.x) * cam.zoom, y: (c.y - cam.worldView.y) * cam.zoom };
  }`);
  await page.getByTestId('stage').click({ position: cell, force: true });
  await expect.poll(() => sim<number>(page, '(s) => s.run.grid.slotsUsed')).toBe(1);
  await page.getByTestId('prep-call-early').click();
  await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('wave');
  await expect.poll(() => sim<number>(page, '(s) => s.run.waveAlive'), { timeout: 10_000 }).toBeGreaterThan(0);
});

test('keyboard moves the hero; Space calls wave; Esc pauses', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard is desktop only');
  const x0 = await sim<number>(page, '(s) => s.run.w.x[s.run.hero]');
  await page.keyboard.down('d');
  // Headless Chrome renders with software GL at a low frame rate, so poll rather than sleep.
  await expect.poll(() => sim<number>(page, '(s) => s.run.w.x[s.run.hero]'), { timeout: 10_000 }).toBeGreaterThan(x0 + 30);
  await page.keyboard.up('d');
  await page.keyboard.press('Space');
  await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('wave');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-resume')).toBeHidden();
});

test('virtual joystick moves the hero on touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only');
  await page.getByTestId('prep-call-early').click(); // removes the build bar from the bottom
  const zone = page.getByTestId('joystick-zone');
  const box = (await zone.boundingBox())!;
  const y0 = await sim<number>(page, '(s) => s.run.w.y[s.run.hero]');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // Synthesize a touch drag upward with pointer events (Playwright touchscreen only taps).
  await zone.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: cx, clientY: cy, isPrimary: true });
  await expect(page.getByTestId('joystick')).toBeVisible();
  await zone.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: cx, clientY: cy - 60, isPrimary: true });
  await expect.poll(() => sim<number>(page, '(s) => s.run.w.y[s.run.hero]'), { timeout: 10_000 }).toBeLessThan(y0 - 30);
  await zone.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: cx, clientY: cy - 60, isPrimary: true });
});

test('mobile: no HUD element in the bottom 200 px during a wave', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout');
  await page.getByTestId('prep-call-early').click();
  await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('wave');
  const vh = page.viewportSize()!.height;
  for (const id of ['hud-hero-hp', 'hud-core-hp', 'hud-wave', 'hud-timer', 'hud-score', 'hud-pause']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.y + b.height, id).toBeLessThanOrEqual(vh - 200);
  }
});
