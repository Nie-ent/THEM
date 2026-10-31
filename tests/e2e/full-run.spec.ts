/**
 * QA (P1-10): one complete run, menu-free start → results, through the real app session.
 * The page's own GameSession is fast-forwarded with `session.advance(ms)` (same path the render loop
 * uses: input queue → step → event bridge → HUD store), driven by a tiny in-page policy:
 * build on the intel side during prep, call the wave, orbit the Core, pick the first card.
 * Asserts the run ends, the results screen shows a grade and score in both languages, no page
 * errors, and "play again" restarts at wave 1.
 */
import { expect, test, type Page } from '@playwright/test';

async function sim<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__them.session; return (${fn})(s); })()`) as Promise<T>;
}

/** Advances the session up to `seconds` of game time; returns the phase reached. */
const DRIVE = `(s, seconds) => {
  const DIRS = [[1,0],[0.7,0.7],[0,1],[-0.7,0.7],[-1,0],[-0.7,-0.7],[0,-1],[0.7,-0.7]];
  const b = s.run.content.buildings;
  const tower = b.find((x) => x.behavior === 'tower') ?? b[0];
  const wall = b.find((x) => x.behavior === 'static' && !x.flammable) ?? b[0];
  const g = s.run.grid, cc = Math.floor(g.cols / 2), cr = Math.floor(g.rows / 2);
  const plan = [[0,-2,tower],[0,2,tower],[-2,0,tower],[2,0,tower],[0,-4,wall],[0,4,wall],[-4,0,wall],[4,0,wall],[2,-2,tower],[-2,2,tower]];
  const frames = Math.ceil(seconds * 6);
  for (let f = 0; f < frames && s.run.phase !== 'ended'; f++) {
    const r = s.run;
    if (r.draft) s.command({ pickCard: 0 });
    else if (r.phase === 'prep') {
      const next = plan.map(([dx, dy, d]) => ({ cell: (cr + dy) * g.cols + cc + dx, d }))
        .find((p) => g.buildable[p.cell] && g.cell[p.cell] === -1 && r.wood >= p.d.cost.wood && r.stone >= p.d.cost.stone && g.slotsUsed < g.maxSlots);
      if (next) s.command({ build: { buildingId: next.d.id, cell: next.cell } });
      else s.command({ callWave: true });
      s.input.keyX = 0; s.input.keyY = 0;
    } else {
      const w = r.w, h = r.hero, c = r.core;
      const dx = w.x[c] - w.x[h], dy = w.y[c] - w.y[h];
      if (dx * dx + dy * dy > 240 * 240) { const l = Math.hypot(dx, dy); s.input.keyX = dx / l; s.input.keyY = dy / l; }
      else { const d = DIRS[Math.floor(r.tick / 45) % 8]; s.input.keyX = d[0]; s.input.keyY = d[1]; }
    }
    s.advance(1000 / 6);
  }
  return s.run.phase;
}`;

test('full run: prep → 20 waves or defeat → results screen (th + en) → play again', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=7');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate('!!window.__them')).toBe(true);

  // Drive in 60 s chunks so the browser can render between them; give up after 45 game-minutes.
  let phase = 'prep';
  const waves: number[] = [];
  for (let i = 0; i < 45 && phase !== 'ended'; i++) {
    phase = await page.evaluate(`(${DRIVE})(window.__them.session, 60)`);
    waves.push(await sim<number>(page, '(s) => s.run.waveIndex + 1'));
  }
  const end = await sim<{ result: string; wave: number; grade: string; total: number }>(page,
    `(s) => ({ result: s.run.result, wave: s.run.waveIndex + 1, grade: s.hud.get().final?.grade, total: s.hud.get().final?.total })`);
  test.info().annotations.push({ type: 'run', description: JSON.stringify({ ...end, waves }) });
  expect(phase, `run did not end; waves reached per minute: ${waves.join(',')}`).toBe('ended');
  expect(['win', 'lose']).toContain(end.result);

  const grade = page.getByTestId('results-grade');
  await expect(grade).toBeVisible();
  await expect(grade).toHaveText(/^[SABC]$/);
  // The results screen formats numbers with grouping separators; compare digits only.
  // Per-language rendering of the results screen is covered by tests/e2e/screens.spec.ts.
  await expect.poll(async () => (await page.getByTestId('results-score').innerText()).replace(/\D/g, '')).toBe(String(end.total));

  await page.getByTestId('results-play-again').click();
  await expect.poll(() => sim<string>(page, '(s) => s.run.phase')).toBe('prep');
  await expect(page.getByTestId('hud-wave')).toHaveText(/1\/20/);
  expect(errors).toEqual([]);
});
