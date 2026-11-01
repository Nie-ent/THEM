/**
 * P2-10 Camp (docs/design/screens/camp.md): every tab on desktop 1280×720 and mobile 390×844, in
 * Thai and English, plus one real action per tab against the live profile store. Screenshots (DPR 1)
 * go to docs/design/screenshots/P2-10/camp-<tab>-<desktop|mobile>-<th|en>.png for design review.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const LANGS = ['th', 'en'] as const;
const TABS = ['character', 'traits', 'gear', 'heroes', 'summon', 'titles'] as const;
const SHOTS = 'docs/design/screenshots/P2-10';

test.use({ deviceScaleFactor: 1 });

/** Seed a well-progressed profile (Lv 36, points, gold, materials, a title) through the debug hook. */
async function seed(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(globalThis as unknown as { __themProfile?: { profile: unknown } }).__themProfile?.profile);
  await page.evaluate(() => {
    const store = (globalThis as unknown as { __themProfile: { profile: Record<string, unknown>; replace: (p: unknown) => void } }).__themProfile;
    const p = structuredClone(store.profile) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    p.level = 36;
    p.unspentStatPoints = 12;
    p.traits = { nodes: {}, unspentPoints: 20, respecs: 0 };
    p.currencies = { gold: 50_000 };
    p.items = { 'enhance-stone': 60, 'protection-scroll': 3, 'exp-book-small': 30, 'exp-book-large': 5, 'star-shard': 40, 'essence-garroth': 10, 'time-crystal': 2, 'class-seal': 1 };
    p.titles = { unlocked: ['garroth-victor', 'spotless', 'veteran'], equipped: null };
    store.replace(p);
  });
}

async function openCamp(page: Page, lang: string): Promise<void> {
  await page.addInitScript(`try { window.localStorage.setItem('them.lang', ${JSON.stringify(lang)}); } catch (e) { /* ignore */ }`);
  await page.goto('/?seed=7');
  await expect(page.getByTestId('menu')).toBeVisible();
  await seed(page);
  await page.getByTestId('menu-camp').click();
  await expect(page.getByTestId('camp')).toBeVisible();
  await expect(page.getByTestId('camp-level')).toContainText('36');
}

const shot = (page: Page, info: TestInfo, tab: string, lang: string) =>
  page.screenshot({ path: `${SHOTS}/camp-${tab}-${info.project.name}-${lang}.png` });

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const lang of LANGS) {
  test(`camp: every tab renders without overflow (${lang})`, async ({ page }, info) => {
    await openCamp(page, lang);
    for (const tab of TABS) {
      await page.getByTestId(`camp-tab-${tab}`).click();
      await expect(page.getByTestId(`camp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await noHorizontalScroll(page);
      await shot(page, info, tab, lang);
    }
    await page.getByTestId('camp-back').click();
    await expect(page.getByTestId('menu')).toBeVisible();
  });
}

for (const lang of LANGS) {
  test(`camp: gear enhance panel at +11 shows the drop risk, protection off and on (${lang})`, async ({ page }, info) => {
    await openCamp(page, lang);
    await page.evaluate(() => {
      const store = (globalThis as unknown as { __themProfile: { profile: Record<string, unknown>; replace: (p: unknown) => void } }).__themProfile;
      const p = structuredClone(store.profile) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const blade = p.gear.items.find((g: { itemId: string }) => g.itemId === 'worn-blade');
      blade.enhance = 11;
      store.replace(p);
    });
    await page.getByTestId('camp-tab-gear').click();
    const uid = await page.evaluate<string>(() => {
      const st = (globalThis as unknown as { __themProfile: { profile: { gear: { items: { uid: string; itemId: string }[] } } } }).__themProfile;
      return st.profile.gear.items.find((g) => g.itemId === 'worn-blade')!.uid;
    });
    await page.getByTestId(`gear-item-${uid}`).click();
    await expect(page.getByTestId('gear-risk')).toBeVisible();
    await page.getByTestId('gear-enhance').scrollIntoViewIfNeeded();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/camp-gear-enhance-${info.project.name}-${lang}.png` });
    await page.getByTestId('gear-protect').check();
    await page.getByTestId('gear-enhance').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/camp-gear-enhance-protected-${info.project.name}-${lang}.png` });
  });
}

for (const lang of LANGS) {
  test(`results: a won run shows its rewards, level-up and new title (${lang})`, async ({ page }, info) => {
    await page.addInitScript(`try { window.localStorage.setItem('them.lang', ${JSON.stringify(lang)}); } catch (e) { /* ignore */ }`);
    await page.goto('/?seed=7');
    await expect(page.getByTestId('menu')).toBeVisible();
    await page.getByTestId('menu-start').click();
    await expect(page.getByTestId('hud-wave')).toBeVisible();
    // End the run the way the sim does (phase, result, runEnd event); the session records it in the profile.
    await page.evaluate(() => {
      const s = (globalThis as unknown as { __them: { session: { run: Record<string, any>; advance: (ms: number) => void } } }).__them.session; // eslint-disable-line @typescript-eslint/no-explicit-any
      const r = s.run;
      r.waveIndex = 19;
      r.activeTicks = 19 * 60 * 30;
      r.phase = 'ended';
      r.result = 'win';
      r.events.push({ type: 'runEnd', result: 'win', score: { kills: { normal: 1600, elite: 40, miniboss: 3, boss: 1 }, killPoints: 2100, bossBonus: 500, mDifficulty: 1, mSpeed: 1.2, mDamage: 1.1, performance: 1.32, total: 3432, grade: 'A', rewardPct: 100 } });
      s.advance(40);
    });
    const rewards = page.getByTestId('results-rewards');
    await expect(rewards).toBeVisible();
    // Rewards come from the sim's own score of the run state above (grade S here: 120 gold, 84 EXP)
    // and its facts (hero unhurt, Core full), so several titles unlock at once.
    const rec = await page.evaluate(() => (globalThis as unknown as { __themProfile: { lastRun: { rewards: { currencies: { gold: number }; exp: number }; newTitles: string[]; levelsGained: number } } }).__themProfile.lastRun);
    expect(rec.rewards.currencies.gold).toBeGreaterThan(0);
    expect(rec.levelsGained).toBeGreaterThan(0);
    expect(rec.newTitles).toContain('garroth-victor');
    await expect(rewards.locator('li')).toHaveCount(2 + 1 + 3 + rec.newTitles.length); // gold, EXP, level up, 3 items, titles
    await expect(rewards).toContainText(String(rec.rewards.exp));
    await page.screenshot({ path: `${SHOTS}/results-rewards-${info.project.name}-${lang}.png` });
  });
}

test('camp: actions on every tab change the saved profile', async ({ page }) => {
  await openCamp(page, 'en');
  const profile = () => page.evaluate(() => (globalThis as unknown as { __themProfile: { profile: Record<string, any> } }).__themProfile.profile); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Character: spend 2 points in strength, pick a class.
  await page.getByTestId('stat-strength-plus').click();
  await page.getByTestId('stat-strength-plus').click();
  await page.getByTestId('stats-confirm').click();
  expect((await profile()).stats.strength).toBe(2);
  await page.getByTestId('class-pick-warrior').click();
  expect((await profile()).classId).toBe('warrior');
  await page.getByTestId('class-pick-berserker').click();
  expect((await profile()).classId).toBe('berserker');

  // Traits: learn the first vanguard node.
  await page.getByTestId('camp-tab-traits').click();
  await page.getByTestId('trait-vg-thick-skin-learn').click();
  expect((await profile()).traits.nodes['vg-thick-skin']).toBe(1);

  // Gear: enhance the worn blade (+0 → +1 always succeeds).
  await page.getByTestId('camp-tab-gear').click();
  const blade = (await profile()).gear.items.find((g: { itemId: string }) => g.itemId === 'worn-blade').uid as string;
  await page.getByTestId(`gear-item-${blade}`).click();
  await page.getByTestId('gear-enhance').click();
  await expect(page.getByTestId('gear-result')).toBeVisible();
  expect((await profile()).gear.items.find((g: { uid: string }) => g.uid === blade).enhance).toBe(1);

  // Heroes: feed a manual to the selected hero.
  await page.getByTestId('camp-tab-heroes').click();
  const before = (await profile()).items['exp-book-small'];
  await page.getByTestId('hero-book-small').click();
  expect((await profile()).items['exp-book-small']).toBe(before - 1);

  // Summon: a 10-pull spends gold and lists 10 results.
  await page.getByTestId('camp-tab-summon').click();
  await page.getByTestId('summon-10').click();
  await expect(page.getByTestId('summon-results').locator('li')).toHaveCount(10);
  expect((await profile()).gacha.totalPulls).toBe(10);

  // Titles: equip an earned title.
  await page.getByTestId('camp-tab-titles').click();
  await page.getByTestId('title-equip-spotless').click();
  await expect(page.getByTestId('title-equipped')).toBeVisible();
  expect((await profile()).titles.equipped).toBe('spotless');

  // Everything is saved: the stored save matches the profile.
  const saved = await page.evaluate(() => JSON.parse((globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage.getItem('them.save') ?? 'null')?.profile?.titles?.equipped);
  expect(saved).toBe('spotless');
});
