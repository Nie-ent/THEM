/**
 * P1-08 screens: every screen at 1280×720 and 390×844, in Thai and English. Screenshots (DPR 1) are
 * written to docs/design/screenshots/P1-08/<screen>-<desktop|mobile>-<th|en>.png for design review.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const LANGS = ['th', 'en'] as const;
const SHOTS = 'docs/design/screenshots/P1-08';

test.use({ deviceScaleFactor: 1 });

const sim = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__them.session; return (${fn})(s); })()`) as Promise<T>;

async function open(page: Page, lang: string, start = true): Promise<void> {
  await page.addInitScript(`try { window.localStorage.setItem('them.lang', ${JSON.stringify(lang)}); } catch (e) { /* ignore */ }`);
  await page.goto('/?seed=7');
  await expect(page.getByTestId('menu')).toBeVisible();
  if (start) {
    await page.getByTestId('menu-start').click();
    await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
    await expect(page.getByTestId('hud-wave')).toBeVisible();
  }
}

const shot = (page: Page, info: TestInfo, screen: string, lang: string) =>
  page.screenshot({ path: `${SHOTS}/${screen}-${info.project.name}-${lang}.png` });

/** No horizontal scroll and every listed element lies inside the viewport. */
async function expectFits(page: Page, ids: string[]): Promise<void> {
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
  expect(overflow).toBeLessThanOrEqual(0);
  const vp = page.viewportSize()!;
  for (const id of ids) {
    const box = await page.getByTestId(id).first().boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x, id).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(vp.width + 1);
    expect(box!.y + box!.height, id).toBeLessThanOrEqual(vp.height + 1);
  }
}

/**
 * End the run the way the sim does (phase, result, runEnd event) with a breakdown computed from the
 * GDD §12 example (1600×1 + 40×5 + 3×100, speed 1.15, damage 1.05). Core destroyed unless `win`.
 */
async function endRun(page: Page, result: 'win' | 'lose'): Promise<void> {
  await sim(page, `(s) => {
    const r = s.run;
    const base = 1600 + 200 + 300 + (${result === 'win' ? 500 : 0});
    const mSpeed = 1.15, mDamage = 1.05;
    r.w.hp[r.core] = ${result === 'win' ? 'r.w.maxHp[r.core]' : '0'};
    r.phase = 'ended'; r.result = '${result}';
    r.events.push({ type: 'runEnd', result: '${result}', score: {
      kills: { normal: 1600, elite: 40, miniboss: 3, boss: 0 }, killPoints: 2100, bossBonus: base - 2100,
      mDifficulty: 1, mSpeed, mDamage, performance: mSpeed * mDamage, total: Math.round(base * mSpeed * mDamage),
      grade: 'A', rewardPct: 100 } });
    s.advance(40);
  }`);
}

/** Open a card draft by granting a pending level; the sim opens the offer on its next step. */
async function openDraft(page: Page): Promise<void> {
  await sim(page, '(s) => { s.run.pendingLevels += 1; s.run.level += 1; }');
  await expect(page.getByTestId('draft-card-0')).toBeVisible();
}

for (const lang of LANGS) {
  test.describe(`screens (${lang})`, () => {
    test(`menu: ${lang}`, async ({ page }, info) => {
      await open(page, lang, false);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByTestId('menu-start')).toBeFocused();
      await page.waitForTimeout(900); // title wipe finished
      await expectFits(page, ['menu-start', 'menu-settings', 'lang-th', 'lang-en']);
      const start = (await page.getByTestId('menu-start').boundingBox())!;
      expect(start.height).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 56 : 48);
      if (info.project.name === 'mobile') expect(start.y).toBeGreaterThan(844 * (2 / 3) - 120); // thumb zone
      await shot(page, info, 'menu', lang);
    });

    test(`hud (wave): ${lang}`, async ({ page }, info) => {
      await open(page, lang);
      await page.getByTestId('prep-call-early').click();
      await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('wave');
      await expect.poll(() => sim<number>(page, '(s) => s.run.waveAlive'), { timeout: 15_000 }).toBeGreaterThan(0);
      await expectFits(page, ['hud-hero-hp', 'hud-core-hp', 'hud-xp', 'hud-level', 'hud-wave', 'hud-timer', 'hud-wood', 'hud-stone', 'hud-score', 'hud-pause']);
      if (info.project.name === 'mobile') {
        for (const id of ['hud-hero-hp', 'hud-core-hp', 'hud-wave', 'hud-timer', 'hud-score', 'hud-pause', 'hud-wood']) {
          const b = (await page.getByTestId(id).boundingBox())!;
          expect(b.y + b.height, id).toBeLessThanOrEqual(168);
        }
        const pause = (await page.getByTestId('hud-pause').boundingBox())!;
        expect(pause.width).toBeGreaterThanOrEqual(44);
        expect(pause.height).toBeGreaterThanOrEqual(44);
      }
      await shot(page, info, 'hud', lang);
    });

    test(`prep: ${lang}`, async ({ page }, info) => {
      await open(page, lang);
      await expect(page.getByTestId('prep-timer')).toBeVisible();
      await expect(page.getByTestId('intel-compass')).toBeVisible();
      await expect(page.getByTestId('intel-enemy-raider')).toBeVisible();
      for (const id of ['build-slots', 'build-upkeep', 'build-tab-wood', 'build-tab-stone', 'build-item-wood-wall']) await expect(page.getByTestId(id)).toBeVisible();
      await page.getByTestId('build-tab-stone').click();
      await expect(page.getByTestId('build-item-stone-wall')).toBeVisible();
      await page.getByTestId('build-tab-wood').click();
      await expect(page.getByTestId('prep-hero-mira')).toBeVisible();
      await page.waitForTimeout(500);
      await expectFits(page, ['prep-timer', 'prep-call-early', 'build-slots', 'build-upkeep']);
      await shot(page, info, 'prep', lang);
    });

    test(`prep build flow (touch: select then confirm): ${lang}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'touch flow');
      await open(page, lang);
      const slotsBefore = await sim<number>(page, '(s) => s.run.grid.slotsUsed');
      const target = await sim<{ x: number; y: number }>(page, `(s) => {
        const cam = window.__them.game.scene.getScene('stage').cameras.main;
        const c = s.cellCenter(5 * 13 + 3);
        return { x: (c.x - cam.worldView.x) * cam.zoom, y: (c.y - cam.worldView.y) * cam.zoom };
      }`);
      await page.getByTestId('build-item-wood-wall').click();
      await page.getByTestId('stage').click({ position: target, force: true });
      await expect(page.getByTestId('build-confirm')).toBeEnabled();
      expect(await sim<number>(page, '(s) => s.run.grid.slotsUsed')).toBe(slotsBefore); // a tap alone never builds
      await shot(page, info, 'prep-ghost', lang);
      await page.getByTestId('build-confirm').click();
      await expect.poll(() => sim<number>(page, '(s) => s.run.grid.slotsUsed')).toBe(slotsBefore + 1);
    });

    test(`draft: ${lang}`, async ({ page }, info) => {
      await open(page, lang);
      await openDraft(page);
      await expect(page.getByTestId('draft-card-2')).toBeVisible();
      await expect(page.getByTestId('draft-reroll')).toBeVisible();
      await page.waitForTimeout(900);
      const withDrawback = await page.locator('[data-testid^="draft-drawback-"]').count();
      if (info.project.name === 'mobile') {
        await expectFits(page, ['draft-card-0', 'draft-reroll', 'draft-take']);
      } else {
        await expectFits(page, ['draft-card-0', 'draft-card-1', 'draft-card-2', 'draft-reroll']);
        const a = (await page.getByTestId('draft-card-0').boundingBox())!;
        expect(Math.round(a.width)).toBe(296);
        expect(Math.round(a.height)).toBe(400);
      }
      expect(withDrawback).toBeGreaterThanOrEqual(0);
      await shot(page, info, 'draft', lang);
    });

    test(`pause: ${lang}`, async ({ page }, info) => {
      await open(page, lang);
      await page.getByTestId('hud-pause').click();
      await expect(page.getByTestId('pause-resume')).toBeFocused();
      expect(await sim<boolean>(page, '(s) => s.run.paused')).toBe(true);
      await expectFits(page, ['pause-resume', 'pause-settings', 'pause-restart', 'pause-quit']);
      if (info.project.name === 'desktop') await page.getByTestId('pause-settings').click();
      await expect(info.project.name === 'desktop' ? page.getByTestId('setting-damageNumbers') : page.getByTestId('pause-quit')).toBeVisible();
      await shot(page, info, 'pause', lang);
      if (info.project.name === 'mobile') {
        await page.getByTestId('pause-settings').click();
        await expect(page.getByTestId('setting-damageNumbers')).toBeVisible();
        await shot(page, info, 'settings', lang);
      } else {
        await shot(page, info, 'settings', lang);
      }
    });

    test(`results (defeat): ${lang}`, async ({ page }, info) => {
      await open(page, lang);
      await endRun(page, 'lose');
      await expect(page.getByTestId('results-grade')).toBeVisible();
      await expect(page.getByTestId('results-play-again')).toBeFocused();
      await page.keyboard.press('Shift'); // any key skips the reveal
      await page.waitForTimeout(300);
      await expect(page.getByTestId('results-grade')).toHaveText(/^[SABC]$/);
      for (const k of ['kill', 'boss', 'base', 'difficulty', 'speed', 'damage']) await expect(page.getByTestId(`results-line-${k}`)).toBeVisible();
      await expect(page.getByTestId('results-score')).toBeVisible();
      await expect(page.getByTestId('results-cause')).toBeVisible();
      await expectFits(page, info.project.name === 'mobile' ? ['results-grade', 'results-play-again', 'results-menu'] : ['results-grade', 'results-score', 'results-play-again', 'results-menu']);
      const grade = (await page.getByTestId('results-grade').boundingBox())!;
      expect(grade.width).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 160 : 200);
      await shot(page, info, 'results', lang);
    });
  });
}

test('language toggle persists per viewer and sets <html lang>', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('lang-th').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByTestId('menu-start')).toHaveText('เริ่มเล่น');
  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('menu-start')).toHaveText('Start');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('menu-start')).toHaveText('Start');
});

test('menu settings page is reachable and Esc goes back', async ({ page }) => {
  await open(page, 'en', false);
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByTestId('setting-reduceMotion-on').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await page.reload();
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('setting-reduceMotion-on')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu')).toBeVisible();
});

test('reduced motion preference is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'en', false);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
});

test('draft ignores input for 400 ms, then picks; reroll count decrements', async ({ page }, info) => {
  await open(page, 'en');
  // Tap/click the instant the draft mounts (software GL frames can take longer than the lock itself).
  const stillOpen = await page.evaluate<boolean>(`new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      const card = document.querySelector('[data-testid=draft-card-0]');
      if (!card) return;
      obs.disconnect();
      card.click();
      document.querySelector('[data-testid=draft-reroll]').click();
      resolve(window.__them.session.run.draft !== null);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.__them.session.run.pendingLevels += 1;
  })`);
  expect(stillOpen).toBe(true);
  await page.waitForTimeout(600);
  const before = await sim<number>(page, '(s) => s.run.rerollsLeft');
  await page.getByTestId('draft-reroll').click();
  await expect.poll(() => sim<number>(page, '(s) => s.run.rerollsLeft')).toBe(before - 1);
  await page.waitForTimeout(500);
  if (info.project.name === 'mobile') {
    await page.getByTestId('draft-card-0').click();
    await expect(page.getByTestId('draft-card-0')).toHaveAttribute('aria-pressed', 'true');
    expect(await sim<boolean>(page, '(s) => s.run.draft !== null')).toBe(true); // selecting never picks
    await page.getByTestId('draft-take').click();
  } else {
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
  }
  await expect.poll(() => sim<boolean>(page, '(s) => s.run.draft === null')).toBe(true);
  await expect(page.getByTestId('draft-card-0')).toBeHidden();
});

test('pause: Esc closes the topmost layer, restart asks first, resume counts 3-2-1', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard flow');
  await open(page, 'en');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-resume')).toBeFocused();
  await page.getByTestId('pause-restart').click();
  await expect(page.getByTestId('confirm-keep')).toBeFocused();
  await page.keyboard.press('Escape'); // closes the confirm only
  await expect(page.getByTestId('confirm-keep')).toBeHidden();
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-countdown')).toBeVisible();
  expect(await sim<boolean>(page, '(s) => s.run.paused')).toBe(true);
  await expect.poll(() => sim<boolean>(page, '(s) => s.run.paused'), { timeout: 6_000 }).toBe(false);
  await page.keyboard.press('p');
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await page.getByTestId('pause-quit').click();
  await page.getByTestId('confirm-quit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
});

test('results: Menu returns to the menu, Play again restarts', async ({ page }) => {
  await open(page, 'en');
  await endRun(page, 'win');
  await expect(page.getByTestId('results-line-boss')).toContainText('500');
  await page.getByTestId('results-play-again').click();
  await expect(page.getByTestId('results')).toBeHidden();
  await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('prep');
  await endRun(page, 'lose');
  await page.getByTestId('results-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('menu-best')).toBeVisible();
});
