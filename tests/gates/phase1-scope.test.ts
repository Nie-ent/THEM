/**
 * QA gate: World 1 content matches the PHASE1 scope (docs/PHASE1.md "In scope"). Counts and
 * structure only; balance numbers are the balance bot's job.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';

const world = content.worlds.find((w) => w.id === 'garroth')!;
const enemy = (id: string) => content.enemies.find((e) => e.id === id)!;

describe('PHASE1 scope (QA gate)', () => {
  it('World 1 exists with 20 waves and 25 s prep', () => {
    expect(world).toBeDefined();
    expect(world.waves.length).toBe(20);
    expect(world.prepSeconds).toBe(25);
  });

  it('mini-boss waves on 5, 10, 15 and the boss on 20', () => {
    const kinds = world.waves.map((w, i) => [i + 1, w.kind] as const).filter(([, k]) => k !== 'normal');
    expect(kinds).toEqual([[5, 'miniboss'], [10, 'miniboss'], [15, 'miniboss'], [20, 'boss']]);
    for (const [n, k] of kinds) {
      const tiers = world.waves[n - 1]!.groups.map((g) => enemy(g.enemy).tier);
      expect(tiers, `wave ${n}`).toContain(k);
    }
  });

  it('6 non-boss enemy types are used in the waves', () => {
    const used = new Set(world.waves.flatMap((w) => w.groups.map((g) => g.enemy)));
    const regular = [...used].filter((id) => ['normal', 'elite'].includes(enemy(id).tier));
    expect(regular.length).toBeGreaterThanOrEqual(6);
  });

  it('3 distinct mini-bosses; the boss has >= 3 phases and an enrage timer', () => {
    const minis = new Set(world.waves.flatMap((w) => w.groups.map((g) => g.enemy)).filter((id) => enemy(id).tier === 'miniboss'));
    expect(minis.size).toBe(3);
    const bossIds = world.waves[19]!.groups.map((g) => enemy(g.enemy)).filter((e) => e.tier === 'boss');
    expect(bossIds.length).toBe(1);
    const b = content.bosses.find((x) => x.id === bossIds[0]!.boss)!;
    expect(b.phases.length).toBeGreaterThanOrEqual(3);
    expect(b.enrageSeconds).toBeGreaterThan(0);
  });

  it('12 cards, some with drawbacks; 2 rerolls per run', () => {
    // Phase 2 adds class cards (exclusive: only offered with a class); the shared pool stays 12.
    const shared = content.cards.filter((c) => !c.exclusive);
    expect(shared.length).toBe(12);
    // Exclusive cards sit after the shared pool so bare runs roll exactly as in Phase 1.
    expect(content.cards.slice(0, 12).every((c) => !c.exclusive)).toBe(true);
    expect(shared.filter((c) => c.drawbackKey).length).toBeGreaterThan(0);
    expect(content.balance.rerollsPerRun).toBe(2);
    expect(content.balance.cardChoices).toBe(3);
  });

  it('4 buildings incl. wood and stone walls; wood is flammable, stone is not', () => {
    expect(content.buildings.length).toBe(4);
    const walls = content.buildings.filter((b) => b.behavior === 'static');
    expect(walls.some((b) => b.material === 'wood' && b.flammable)).toBe(true);
    expect(walls.some((b) => b.material === 'stone' && !b.flammable)).toBe(true);
    expect(content.buildings.every((b) => b.upkeep.wood + b.upkeep.stone > 0)).toBe(true);
  });

  it('2 AI heroes: a 1-star and a 2-star with different personalities', () => {
    // Phase 2 adds gacha heroes (defaultTeam: false); the default run team stays the Phase 1 pair.
    const team = content.heroes.filter((h) => h.defaultTeam);
    expect(team.length).toBe(2);
    expect(team.map((h) => h.stars).sort()).toEqual([1, 2]);
    expect(new Set(team.map((h) => h.personality)).size).toBe(2);
  });

  it('GDD §12 scoring constants', () => {
    const s = content.balance.scoring;
    expect(s.killPoints).toMatchObject({ normal: 1, elite: 5, miniboss: 100 });
    expect(s.bossBonus).toBe(500);
    expect(s.speed).toEqual({ min: 0.7, max: 1.3 });
    expect(s.damage).toEqual({ coreBase: 0.7, coreWeight: 0.3, heroBase: 1.2, heroWeight: 0.4 });
    expect(Object.fromEntries(s.grades.map((g) => [g.grade, [g.min, g.rewardPct]]))).toEqual({ S: [1.4, 120], A: [1.15, 100], B: [0.9, 80], C: [0, 60] });
  });
});
