import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, drainEvents, step, type InputFrame, type Run, type SimEvent } from '../src/api';
import { Flag } from '../src/constants';
import { buildingBehaviors, cardEffects, personalities } from '../src/registry';
import { getCtx } from '../src/sim';

const idle: InputFrame = { moveX: 0, moveY: 0 };
const cell = (r: number, c: number) => r * 13 + c;

function newRun(seed = 1): Run {
  return createRun({ worldId: 'garroth' }, content, seed);
}
function run1(run: Run, input: InputFrame = idle): SimEvent[] {
  step(run, input);
  return drainEvents(run);
}
function pick(run: Run, cardId: string, nextLevel = 1) {
  run.draft = [{ cardId, nextLevel }];
  run.pendingLevels = 1;
  run1(run, { ...idle, pickCard: 0 });
}
/** A stationary raider (it is made harmless and immobile so effects can be measured). */
function dummy(run: Run, x: number, y: number): number {
  const e = getCtx(run).spawnEnemy('raider', x, y);
  run.w.speed[e] = 0;
  run.w.wDamage[e] = 0;
  run.w.flags[e] |= Flag.IgnoresAggro;
  return e;
}

describe('P1-07 content resolves in the registries', () => {
  it('every card effect, building behaviour and hero personality id is registered', () => {
    for (const c of content.cards) expect(cardEffects.has(c.effect), `card ${c.id} -> ${c.effect}`).toBe(true);
    for (const b of content.buildings) expect(buildingBehaviors.has(b.behavior), `building ${b.id} -> ${b.behavior}`).toBe(true);
    for (const h of content.heroes) expect(personalities.has(h.personality), `hero ${h.id} -> ${h.personality}`).toBe(true);
  });

  it('ships 12 cards (at least 4 with a drawback), 4 buildings and 2 AI heroes (1 star and 2 star)', () => {
    expect(content.cards).toHaveLength(12);
    expect(content.cards.filter((c) => c.drawbackKey).length).toBeGreaterThanOrEqual(4);
    expect(content.buildings.map((b) => b.id).sort()).toEqual(['archer-tower-wood', 'fire-pit-trap', 'stone-wall', 'wood-wall']);
    expect(content.heroes.map((h) => h.stars).sort()).toEqual([1, 2]);
  });

  it('stat-mods cards apply (and drawbacks bite)', () => {
    const run = newRun();
    pick(run, 'glass-cannon');
    expect(run.mods.damageMult).toBeCloseTo(1.5);
    expect(run.mods.maxHpMult).toBeCloseTo(0.7);
    pick(run, 'swift-boots');
    expect(run.mods.speedMult).toBeCloseTo(1.12);
    expect(run.mods.pickupRadiusMult).toBeCloseTo(0.7);
    pick(run, 'iron-vanguard');
    expect(run.mods.structureDamageMult).toBeCloseTo(0.65);
    pick(run, 'piercing-bolt');
    expect(run.w.wPierce[run.hero]).toBe(1);
  });
});

describe('card pitch-arrows', () => {
  it('ignites on hit, burns over time, adds bonus damage vs burning targets, slows the hero', () => {
    const run = newRun();
    pick(run, 'pitch-arrows');
    expect(run.mods.cooldownMult).toBeCloseTo(1.1);
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const e = dummy(run, 400, 400);
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    ctx.damage(e, 10, 0, run.hero); // first hit: ignites, no bonus
    expect(run.w.burnT[e]).toBeGreaterThan(0);
    expect(run.w.flags[e]! & Flag.Fire).toBeTruthy();
    expect(run.w.hp[e]).toBeCloseTo(990);
    ctx.damage(e, 10, 0, run.hero); // burning: +25% of the hit
    expect(run.w.hp[e]).toBeCloseTo(990 - 10 - 2.5);
    const hp = run.w.hp[e]!;
    for (let i = 0; i < 30; i++) run1(run); // 1 s of burning at burnDps 12
    expect(hp - run.w.hp[e]!).toBeGreaterThan(10);
  });
});

describe('card ember-ring', () => {
  it('pulses fire on nearby enemies only, igniting them', () => {
    const run = newRun();
    pick(run, 'ember-ring');
    run1(run, { ...idle, callWave: true });
    const h = run.hero;
    const near = dummy(run, run.w.x[h]! + 50, run.w.y[h]!);
    const far = dummy(run, run.w.x[h]! + 500, run.w.y[h]!);
    for (const e of [near, far]) run.w.hp[e] = run.w.maxHp[e] = 1000;
    for (let i = 0; i < 65; i++) run1(run); // pulses land (spawns are visible to area effects the same tick)
    expect(run.w.hp[near]).toBeLessThan(1000);
    expect(run.w.burnT[near]).toBeGreaterThan(0);
    expect(run.w.hp[far]).toBe(1000);
  });
});

describe('building fire-pit-trap', () => {
  function withPit(): { run: Run; pit: number } {
    const run = newRun();
    run.wood = 100; run.stone = 100;
    run1(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(0, 1) } });
    run1(run, { ...idle, callWave: true });
    return { run, pit: run.grid.cell[cell(0, 1)]! };
  }

  it('damages and ignites enemies standing in it, and does not block movement', () => {
    const { run, pit } = withPit();
    expect(run.w.flags[pit]! & Flag.Blocking).toBe(0);
    const e = dummy(run, run.w.x[pit]! + 10, run.w.y[pit]!);
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    run1(run);
    expect(run.w.hp[e]).toBeLessThan(1000);
    expect(run.w.burnT[e]).toBeGreaterThan(0);
  });

  it('ignites adjacent wooden walls (friendly fire) but not stone walls or diagonals', () => {
    const { run, pit } = withPit();
    // Wall cells must be built in prep: rebuild a prep run.
    const r2 = newRun();
    r2.wood = 100; r2.stone = 100;
    run1(r2, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(0, 1) } });
    run1(r2, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 2) } });
    run1(r2, { ...idle, build: { buildingId: 'stone-wall', cell: cell(0, 0) } });
    run1(r2, { ...idle, build: { buildingId: 'wood-wall', cell: cell(1, 2) } }); // diagonal
    run1(r2, { ...idle, callWave: true });
    const p = r2.grid.cell[cell(0, 1)]!;
    dummy(r2, r2.w.x[p]! + 5, r2.w.y[p]!);
    run1(r2);
    expect(r2.w.burnT[r2.grid.cell[cell(0, 2)]!]).toBeGreaterThan(0);
    expect(r2.w.burnT[r2.grid.cell[cell(0, 0)]!]).toBe(0);
    expect(r2.w.burnT[r2.grid.cell[cell(1, 2)]!]).toBe(0);
    expect(pit).toBeGreaterThan(-1);
    expect(run).toBeDefined();
  });

  it('does nothing when no enemy is in range', () => {
    const { run, pit } = withPit();
    run1(run);
    expect(run.w.atkT[pit]).toBe(0);
  });
});

describe('personalities reckless and cautious', () => {
  function placed(heroId: string, ex: number): { run: Run; a: number; e: number } {
    const run = newRun();
    const a = run.allies[run.allyDefs.indexOf(run.idx.heroIdx.get(heroId)!)]!;
    run1(run, { ...idle, placeHero: { heroId, x: 1000, y: 1000 } });
    run1(run, { ...idle, callWave: true });
    const e = dummy(run, ex, 1000);
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    return { run, a, e };
  }

  it('reckless (brann) leaves its post to chase and hit an enemy 300 px away', () => {
    const { run, a, e } = placed('brann', 1300);
    const evs: SimEvent[] = [];
    for (let i = 0; i < 150; i++) evs.push(...run1(run));
    expect(run.w.x[a]! - 1000).toBeGreaterThan(150);
    expect(evs.some((x) => x.type === 'hit' && x.e === e && x.source === a)).toBe(true);
  });

  it('reckless returns to its post when nothing is in sight', () => {
    const { run, a, e } = placed('brann', 1300);
    for (let i = 0; i < 60; i++) run1(run);
    getCtx(run).damage(e, 1e9, 1, a); // lethal fire hit (ignores armor)
    for (let i = 0; i < 300; i++) run1(run);
    expect(Math.abs(run.w.x[a]! - 1000)).toBeLessThan(25);
  });

  it('cautious (mira) holds position while the same enemy is out of her chase-free reach', () => {
    const { run, a } = placed('mira', 1300);
    for (let i = 0; i < 90; i++) run1(run);
    expect(Math.abs(run.w.x[a]! - 1000)).toBeLessThanOrEqual(40);
  });
});
