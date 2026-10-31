/**
 * P1-09 stage art + VFX: evidence frames for docs/design/review.md and a few behavioural checks.
 * Screenshots (DPR 1) go to docs/design/screenshots/P1-09/. The page is staged by writing straight
 * into the sim through the read-only `window.__them` hook (dev/e2e only): enemies are frozen in a
 * spiral around the hero so frames are reproducible.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const SHOTS = 'docs/design/screenshots/P1-09';
test.use({ deviceScaleFactor: 1, locale: 'th-TH' });

const run = <T>(page: Page, fn: string, arg?: unknown): Promise<T> =>
  page.evaluate(`(() => { const s = window.__them.session; return (${fn})(s, ${JSON.stringify(arg ?? null)}); })()`) as Promise<T>;

async function start(page: Page, settings?: Record<string, unknown>): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
  if (settings) await page.addInitScript(`try { localStorage.setItem('them.settings', ${JSON.stringify(JSON.stringify(settings))}); } catch (e) { /* ignore */ }`);
  await page.goto('/?seed=7');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  await page.getByTestId('prep-call-early').click();
  await expect.poll(() => run<string>(page, '(s) => s.run.phase')).toBe('wave');
}

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors?: string[] }).errors ?? []).toEqual([]);
});

/** Spawn `n` mixed enemies and freeze them in a spiral around the hero. */
async function crowd(page: Page, n: number): Promise<void> {
  await run(page, `(s, n) => {
    const r = s.run; r.debugInvulnerable = true;
    const mix = [['raider', 40], ['torch-bearer', 14], ['brute', 10], ['slinger', 12], ['wolf-rider', 10], ['war-drummer', 5], ['shield-chieftain', 1], ['beast-master', 1], ['fire-priest', 1], ['varkul', 1]];
    const total = mix.reduce((a, m) => a + m[1], 0);
    let k = 0;
    for (const [id, w] of mix) {
      const cnt = id === 'raider' ? 0 : Math.max(1, Math.round(n * w / total));
      for (let i = 0; i < cnt; i++, k++) r.spawnQueue.push({ at: 0, enemy: r.idx.enemyIdx.get(id), side: 'N' });
    }
    while (k < n) { r.spawnQueue.push({ at: 0, enemy: r.idx.enemyIdx.get('raider'), side: 'N' }); k++; }
  }`, n);
  await expect.poll(() => run<number>(page, `(s) => { const w = s.run.w; let c = 0; for (let i = 0; i < w.highWater; i++) if (w.kind[i] === 3) c++; return c; }`), { timeout: 20_000 }).toBeGreaterThanOrEqual(n - 2);
  await run(page, `(s) => {
    const r = s.run, w = r.w, h = r.hero; let k = 0;
    const cnt = []; for (let i = 0; i < w.highWater; i++) if (w.kind[i] === 3) cnt.push(i);
    cnt.forEach((i, q) => {
      const a = q * 2.39996, d = 55 + 330 * Math.sqrt(q / cnt.length);
      const x = w.x[h] + Math.cos(a) * d * 1.5, y = w.y[h] + Math.sin(a) * d;
      w.x[i] = w.px[i] = x; w.y[i] = w.py[i] = y; w.speed[i] = 0; w.wDamage[i] = 0; w.fx[i] = Math.cos(a + 3.14); w.fy[i] = Math.sin(a + 3.14);
    });
  }`);
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });

test('200-enemy frame, grayscale, and 500-enemy frame', async ({ page }, info) => {
  await start(page);
  await crowd(page, 200);
  await page.waitForTimeout(400);
  await shot(page, info, 'enemies-200');
  await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await page.waitForTimeout(200);
  await shot(page, info, 'enemies-200-grayscale');
  await page.addStyleTag({ content: 'html { filter: none; }' });
});

test('500-enemy frame and render rate', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop budget');
  await start(page);
  await crowd(page, 500);
  await page.waitForTimeout(400);
  await shot(page, info, 'enemies-500');
  const fps = await page.evaluate(`new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  })`) as number;
  const cpu = await page.evaluate(`(() => {
    const sc = window.__them.game.scene.getScene('stage');
    const u = sc.sys.sceneUpdate; let n = 0, tot = 0;
    return new Promise((res) => { sc.sys.sceneUpdate = function (t, d) { const a = performance.now(); u.call(sc, t, d); tot += performance.now() - a; if (++n === 20) { sc.sys.sceneUpdate = u; res(tot / n); } }; });
  })()`);
  console.log(`500-enemy scene.update CPU: ${(cpu as number).toFixed(2)} ms/frame`);
  console.log(`500-enemy render fps (headless software GL): ${fps.toFixed(1)}`);
});

test('telegraph + Core-threat frames, normal and under colour-vision emulation', async ({ page }, info) => {
  await start(page);
  await run(page, `(s) => {
    const r = s.run, w = r.w; r.debugInvulnerable = true;
    const core = r.core, h = r.hero;
    // Hero stands 900 px right of the Core so the Core is off-screen on both viewports.
    w.x[h] = w.px[h] = w.x[core] + 900; w.y[h] = w.py[h] = w.y[core];
    const T = (o) => r.telegraphs.push({ id: r.nextTelegraphId++, t: 0, active: true, r2: 0, dx: 1, dy: 0, damage: 0, targetsCore: false, owner: -1, ...o });
    const hx = w.x[h], hy = w.y[h];
    T({ shape: 'circle', x: hx - 120, y: hy - 90, r: 60, windup: 60, t: 22 });          // wind-up (dashed, sweeping)
    T({ shape: 'rect', x: hx - 200, y: hy + 60, r: 170, r2: 22, dx: 1, dy: 0, windup: 60, t: 59.8 }); // commit (solid + hatch)
    T({ shape: 'cone', x: hx + 40, y: hy + 120, r: 130, r2: 0.82, dx: 0, dy: -1, windup: 60, t: 25 });
    T({ shape: 'ring', x: hx + 150, y: hy - 70, r: 85, r2: 40, windup: 60, t: 59.75 });
    // Attack aimed at the Core: violet double outline, Core ring, edge arrow with countdown.
    T({ shape: 'rect', x: w.x[core] - 300, y: w.y[core], r: 320, r2: 30, dx: 1, dy: 0, windup: 60, t: 35, targetsCore: true });
  }`);
  await page.waitForTimeout(400);
  // Freeze the sim so the commit-phase telegraphs (last 300 ms) stay on screen for the frame.
  await run(page, '(s) => { s.advance = () => {}; }');
  await page.waitForTimeout(300);
  await shot(page, info, 'telegraphs-core-threat');
  const cdp = await page.context().newCDPSession(page);
  for (const type of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
    await page.waitForTimeout(250);
    await shot(page, info, `telegraphs-core-threat-${type}`);
  }
  await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
});

test('mobile: hero and the tiles ahead stay visible with the thumb on the joystick', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch only');
  await start(page);
  await crowd(page, 60);
  const zone = page.getByTestId('joystick-zone');
  const box = (await zone.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await zone.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: cx, clientY: cy, isPrimary: true });
  await expect(page.getByTestId('joystick')).toBeVisible();
  await zone.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: cx + 30, clientY: cy - 30, isPrimary: true });
  await page.waitForTimeout(300);
  await shot(page, info, 'thumb-joystick');
  const hero = await run<{ x: number; y: number }>(page, `(s) => {
    const cam = window.__them.game.scene.getScene('stage').cameras.main, w = s.run.w, h = s.run.hero;
    return { x: (w.x[h] - cam.worldView.x) * cam.zoom, y: (w.y[h] - cam.worldView.y) * cam.zoom };
  }`);
  const vp = page.viewportSize()!;
  expect(hero.y).toBeLessThan(vp.height * 0.45); // hero sits near 38% from the top, above the thumb
  expect(hero.y).toBeGreaterThan(0);
  await zone.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: cx, clientY: cy, isPrimary: true });
});

test('burning structures: flame stages, charred slot, stone spark only', async ({ page }, info) => {
  await page.addInitScript(`try { localStorage.setItem('them.lang', 'th'); } catch (e) { /* ignore */ }`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto('/?seed=7');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  // Build two wood walls, a stone wall and a fire pit during prep, then light the wood.
  await run(page, `(s) => {
    s.run.wood = 99; s.run.stone = 99;
    s.command({ build: { buildingId: 'wood-wall', cell: 4 * 13 + 5 } });
    s.command({ build: { buildingId: 'wood-wall', cell: 4 * 13 + 7 } });
    s.command({ build: { buildingId: 'wood-wall', cell: 4 * 13 + 3 } });
    s.command({ build: { buildingId: 'stone-wall', cell: 4 * 13 + 6 } });
    s.command({ build: { buildingId: 'fire-pit-trap', cell: 10 * 13 + 6 } });
  }`);
  await expect.poll(() => run<number>(page, '(s) => s.run.grid.slotsUsed')).toBe(5);
  await page.getByTestId('prep-call-early').click();
  await expect.poll(() => run<string>(page, '(s) => s.run.phase')).toBe('wave');
  await run(page, `(s) => {
    const r = s.run, g = r.grid, w = r.w; r.debugInvulnerable = true;
    const a = g.cell[4 * 13 + 5], b = g.cell[4 * 13 + 7];
    w.burnT[a] = w.burnT[b] = 60; w.hp[b] = w.maxHp[b] * 0.4;
    const c = g.cell[4 * 13 + 3]; w.burnT[c] = 60; w.hp[c] = 0.1; // burns out: leaves a charred outline
  }`);
  await page.waitForTimeout(500);
  await shot(page, info, 'burning-stages');
  expect(await run<number>(page, '(s) => s.run.w.burnT[s.run.grid.cell[4 * 13 + 6]]')).toBe(0);
});

test('damage numbers are capped at 24 and merge per target', async ({ page }) => {
  await start(page, { damageNumbers: 'all', outline: 'thick', screenShake: false });
  const r = await page.evaluate(`(() => {
    const scene = window.__them.game.scene.getScene('stage');
    for (let u = 1; u <= 60; u++) scene.numbers.add(u, 1000, 1000, 5, 'normal');
    const capped = scene.numbers.live;
    scene.numbers.add(1, 1000, 1000, 5, 'normal'); // merge into an existing target
    return { capped, after: scene.numbers.live };
  })()`) as { capped: number; after: number };
  expect(r.capped).toBe(24);
  expect(r.after).toBe(24);
  // Thick outline setting re-baked the 3 px textures.
  expect(await page.evaluate(`window.__them.game.textures.exists('hero-o3')`)).toBe(true);
});
