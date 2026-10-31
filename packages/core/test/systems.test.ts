import { describe, expect, it } from 'vitest';
import { content, loadContent, raw, type ContentBundle } from '@them/content';
import {
  Kind, cellCenter, createRun, drainEvents, intel, quantizeMove, score, step, view, type InputFrame, type Run, type SimEvent,
} from '../src/api';
import { Flag } from '../src/constants';
import { getCtx } from '../src/sim';

const idle: InputFrame = { moveX: 0, moveY: 0 };
const cell = (r: number, c: number) => r * 13 + c;

function newRun(seed = 1, c: ContentBundle = content): Run {
  return createRun({ worldId: 'garroth' }, c, seed);
}
function run1(run: Run, input: InputFrame = idle): SimEvent[] {
  step(run, input);
  return drainEvents(run);
}
function stepUntil(run: Run, pred: () => boolean, max = 30 * 300, input: InputFrame = idle): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !pred(); i++) all.push(...run1(run, input));
  return all;
}
/** Same content with one array patched (validated again so defaults apply). */
function patched(patch: (r: Record<string, unknown>) => void): ContentBundle {
  const copy = structuredClone(raw) as Record<string, unknown>;
  patch(copy);
  return loadContent(copy);
}

/**
 * The engineer's worked-example boss ("slam-and-charge") is no longer used by World 1 content, so the
 * worked-example tests below get it from a test-only patch of the shipped content.
 */
const TRIAL = patched((r) => {
  (r.enemies as unknown[]).push({
    id: 'trial-brute', nameKey: 'enemy.raider.name', descKey: 'enemy.raider.desc', tier: 'miniboss', hp: 900,
    speed: 50, radius: 26, armor: 0.3, targeting: 'hero', weapon: { damage: 18, cooldown: 1.4, range: 8 },
    xp: 25, boss: 'trial-brute', render: { shape: 'hexagon', scale: 2.2, marks: ['crown'] },
  });
  (r.bosses as unknown[]).push({
    id: 'trial-brute', nameKey: 'boss.varkul.name', script: 'slam-and-charge', enrageSeconds: 90,
    enrageDamageMult: 1.5, enrageSpeedMult: 1.3,
    params: { slamRadius: 90, slamDamage: 25, slamWindup: 1.2, firstSlamDelay: 2 },
    phases: [
      { hpBelow: 1, params: { slamEvery: 5 } },
      { hpBelow: 0.5, params: { slamEvery: 4, coreEvery: 7, coreDamage: 60, coreWidth: 50, coreWindup: 1.5 } },
    ],
  });
});

describe('run state machine', () => {
  it('starts in prep with the world prep time and moves to wave on timeout', () => {
    const run = newRun();
    expect(view(run).phase).toBe('prep');
    expect(view(run).prepTimeLeft).toBe(25);
    const ev = stepUntil(run, () => run.phase === 'wave');
    expect(run.tick).toBe(25 * 30);
    expect(ev.some((e) => e.type === 'waveStart' && e.wave === 1)).toBe(true);
  });

  it('call-wave-early starts immediately; rejected outside prep', () => {
    const run = newRun();
    run1(run, { ...idle, callWave: true });
    expect(run.phase).toBe('wave');
    const ev = run1(run, { ...idle, callWave: true });
    expect(ev).toContainEqual({ type: 'rejected', command: 'callWave', reason: 'notPrep' });
  });

  it('pause freezes the sim and resumes', () => {
    const run = newRun();
    run1(run, { ...idle, pause: true });
    const before = run.prepTimer;
    for (let i = 0; i < 10; i++) run1(run);
    expect(run.prepTimer).toBe(before);
    run1(run, { ...idle, pause: true });
    run1(run);
    expect(run.prepTimer).toBeLessThan(before);
  });

  it('loses when the Core is destroyed', () => {
    const run = newRun();
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    ctx.damage(run.core, 1e9, 0, -1);
    const ev = drainEvents(run);
    expect(run.phase).toBe('ended');
    expect(run.result).toBe('lose');
    expect(ev.find((e) => e.type === 'runEnd')).toBeTruthy();
  });

  it('hero moves with quantized input and is clamped to arena', () => {
    const run = newRun();
    const x0 = view(run).entities.x[run.hero]!;
    for (let i = 0; i < 30; i++) run1(run, quantizeMove(1, 0));
    expect(view(run).entities.x[run.hero]! - x0).toBeCloseTo(170, 0);
  });
});

describe('wave intel', () => {
  it('lists enemy types, counts and side shares of the next wave', () => {
    const run = newRun();
    const i = intel(run)!;
    expect(i.wave).toBe(1);
    expect(i.enemies).toEqual([{ enemyId: 'raider', count: 8 }]);
    expect(i.sides.N).toBe(1);
    const i5 = intel(run, 5)!;
    expect(i5.kind).toBe('miniboss');
    expect(i5.enemies.map((e) => e.enemyId)).toContain('shield-chieftain');
    expect(intel(run, 21)).toBeNull();
  });
});

describe('build grid, resources, upkeep', () => {
  it('builds on a free cell, spends resources, uses a slot', () => {
    const run = newRun();
    const ev = run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 0) } });
    expect(ev.find((e) => e.type === 'buildingPlaced')).toBeTruthy();
    expect(run.wood).toBe(16);
    expect(run.grid.slotsUsed).toBe(1);
    const e = run.grid.cell[cell(0, 0)]!;
    const c = cellCenter(run.grid, cell(0, 0));
    expect(view(run).entities.x[e]).toBe(c.x);
  });

  it('rejects blocked cells, occupied cells, unaffordable builds and builds during waves', () => {
    const run = newRun();
    const r = (b: InputFrame['build']) => run1(run, { ...idle, build: b }).find((e) => e.type === 'rejected');
    expect(r({ buildingId: 'wood-wall', cell: cell(6, 6) })).toMatchObject({ reason: 'notBuildable' });
    run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 0) } });
    expect(r({ buildingId: 'wood-wall', cell: cell(0, 0) })).toMatchObject({ reason: 'occupied' });
    run.stone = 0;
    expect(r({ buildingId: 'stone-wall', cell: cell(0, 1) })).toMatchObject({ reason: 'cost' });
    run1(run, { ...idle, callWave: true });
    expect(r({ buildingId: 'wood-wall', cell: cell(0, 2) })).toMatchObject({ reason: 'notPrep' });
  });

  it('enforces max slots', () => {
    const run = newRun();
    run.wood = 1000;
    for (let k = 0; k < 12; k++) run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: k } });
    expect(run.grid.slotsUsed).toBe(12);
    const ev = run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: 12 } });
    expect(ev.find((e) => e.type === 'rejected')).toMatchObject({ reason: 'noSlots' });
  });

  it('sells for a refund proportional to HP', () => {
    const run = newRun();
    run1(run, { ...idle, build: { buildingId: 'archer-tower-wood', cell: cell(0, 0) } });
    const wood = run.wood;
    const ev = run1(run, { ...idle, sell: cell(0, 0) });
    expect(ev.find((e) => e.type === 'buildingSold')).toMatchObject({ refundWood: 4 });
    expect(run.wood).toBe(wood + 4);
    expect(run.grid.slotsUsed).toBe(0);
  });

  it('charges upkeep at wave end and decays structures it cannot pay for', () => {
    const run = newRun();
    run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 0) } });
    run1(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(0, 2) } });
    run.debugInvulnerable = true;
    run1(run, { ...idle, callWave: true });
    run.wood = 0; // cannot pay the wood wall (bonus +4 arrives first, so drain it at wave end)
    const ev = stepUntil(run, () => run.phase === 'prep');
    const up = ev.find((e) => e.type === 'upkeep');
    expect(up).toBeTruthy();
    expect(up).toMatchObject({ paidStone: 1 });
  });
});

describe('burning (World 1 rule)', () => {
  it('ignites wood, resists on stone, and burns HP down over time', () => {
    const run = newRun();
    run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 0) } });
    run1(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(0, 2) } });
    run1(run, { ...idle, callWave: true });
    const wood = run.grid.cell[cell(0, 0)]!, stone = run.grid.cell[cell(0, 2)]!;
    const ctx = getCtx(run);
    ctx.ignite(wood);
    ctx.ignite(stone);
    const ev = drainEvents(run);
    expect(ev.filter((e) => e.type === 'burn').map((e) => (e as { state: string }).state)).toEqual(['ignite', 'resist']);
    const hp0 = run.w.hp[wood]!;
    for (let i = 0; i < 30; i++) run1(run);
    expect(hp0 - run.w.hp[wood]!).toBeCloseTo(12, 0);
    expect(run.w.hp[stone]).toBe(run.w.maxHp[stone]);
  });

  it('torch-bearer melee hit on a wooden structure ignites it (ignite behaviour)', () => {
    const run = newRun();
    run1(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(0, 0) } });
    run1(run, { ...idle, callWave: true });
    const wall = run.grid.cell[cell(0, 0)]!;
    const ctx = getCtx(run);
    const t = ctx.spawnEnemy('torch-bearer', run.w.x[wall]! - 40, run.w.y[wall]!);
    const ev = stepUntil(run, () => run.w.burnT[wall]! > 0, 300);
    expect(run.w.target[t]).toBe(wall);
    expect(ev.some((e) => e.type === 'burn' && e.state === 'ignite')).toBe(true);
  });
});

describe('XP, level-up and card draft', () => {
  it('levels up from XP, offers 3 distinct cards, freezes the sim until picked', () => {
    const run = newRun();
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    // Spawn and kill a raider next to the hero for XP.
    for (let k = 0; k < 5; k++) {
      const e = ctx.spawnEnemy('raider', run.w.x[run.hero]!, run.w.y[run.hero]!);
      ctx.damage(e, 1e6, 0, run.hero);
    }
    const ev = run1(run);
    expect(ev.find((e) => e.type === 'levelUp')).toMatchObject({ level: 2 });
    const offer = ev.find((e) => e.type === 'cardOffer');
    expect(offer).toBeTruthy();
    const ids = (offer as { options: { cardId: string }[] }).options.map((o) => o.cardId);
    expect(new Set(ids).size).toBe(3);
    const tick = run.activeTicks;
    run1(run);
    expect(run.activeTicks).toBe(tick); // frozen
    const rr = run1(run, { ...idle, reroll: true });
    expect(rr.find((e) => e.type === 'cardOffer')).toMatchObject({ rerollsLeft: 1 });
    const picked = run1(run, { ...idle, pickCard: 0 });
    expect(picked.find((e) => e.type === 'cardPicked')).toBeTruthy();
    expect(run.draft).toBeNull();
    expect(run.cards).toHaveLength(1);
  });

  it('rerolls are limited per run', () => {
    const run = newRun();
    run.pendingLevels = 5;
    run1(run);
    run1(run, { ...idle, reroll: true });
    run1(run, { ...idle, reroll: true });
    const ev = run1(run, { ...idle, reroll: true });
    expect(ev.find((e) => e.type === 'rejected')).toMatchObject({ command: 'reroll', reason: 'noRerolls' });
  });
});

describe('worked examples', () => {
  function pick(run: Run, cardId: string) {
    run.draft = [{ cardId, nextLevel: 1 }];
    run.pendingLevels = 1;
    run1(run, { ...idle, pickCard: 0 });
  }

  it('card stat-mods: sharpened-edge raises hero damage; split-shot adds a projectile with a damage drawback', () => {
    const run = newRun();
    pick(run, 'sharpened-edge');
    expect(run.mods.damageMult).toBeCloseTo(1.15);
    pick(run, 'split-shot');
    expect(run.mods.damageMult).toBeCloseTo(1.15 * 0.85);
    expect(run.w.wCount[run.hero]).toBe(2);
  });

  it('card lifesteal (blood-price): heals on hit, raises damage taken', () => {
    const run = newRun(1, TRIAL);
    pick(run, 'blood-price');
    expect(run.mods.damageTakenMult).toBeCloseTo(1.15);
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    run.w.hp[run.hero] = 50;
    const e = ctx.spawnEnemy('trial-brute', 100, 100);
    ctx.damage(e, 100, 0, run.hero);
    expect(run.w.hp[run.hero]).toBeCloseTo(50 + 100 * 0.7 * 0.04, 6); // armor 0.3
  });

  it('building tower: shoots the nearest enemy in range', () => {
    const run = newRun();
    run1(run, { ...idle, build: { buildingId: 'archer-tower-wood', cell: cell(0, 0) } });
    run1(run, { ...idle, callWave: true });
    const tower = run.grid.cell[cell(0, 0)]!;
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', run.w.x[tower]! - 150, run.w.y[tower]!);
    run.w.speed[e] = 0;
    const ev = stepUntil(run, () => !run.w.isAlive(e) || run.w.uid[e] === 0, 120);
    expect(ev.some((x) => x.type === 'hit' && x.e === e)).toBe(true);
  });

  it('personality cautious: stays at its post while shooting', () => {
    const run = newRun();
    const a = run.allies[0]!;
    run1(run, { ...idle, placeHero: { heroId: 'mira', x: 1000, y: 1000 } });
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', 1200, 1000);
    run.w.speed[e] = 0;
    run.w.flags[e] |= Flag.IgnoresAggro;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60; i++) ev.push(...run1(run));
    const dx = run.w.x[a]! - 1000, dy = run.w.y[a]! - 1000;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(40);
    expect(ev.some((x) => x.type === 'hit' && x.e === e && x.source === a)).toBe(true);
  });

  it('boss slam-and-charge: telegraphs, changes phase at 50%, Core-targeted attack, enrage', () => {
    const run = newRun(1, TRIAL);
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const b = ctx.spawnEnemy('trial-brute', 600, 600);
    let ev = stepUntil(run, () => run.telegraphs.length > 0, 120);
    expect(ev.find((e) => e.type === 'telegraph')).toMatchObject({ state: 'start', targetsCore: false });
    expect(run.telegraphs[0]!.windup).toBeGreaterThanOrEqual(0.7);
    run.w.hp[b] = run.w.maxHp[b]! * 0.49;
    ev = run1(run);
    expect(ev.find((e) => e.type === 'bossPhase')).toMatchObject({ phase: 1, bossId: 'trial-brute' });
    stepUntil(run, () => run.telegraphs.some((t) => t.targetsCore), 120);
    const coreTele = run.telegraphs.find((t) => t.targetsCore)!;
    expect(coreTele.shape).toBe('rect');
    const coreHp = run.w.hp[run.core]!;
    run.debugInvulnerable = false;
    stepUntil(run, () => !run.telegraphs.includes(coreTele), 120);
    expect(run.w.hp[run.core]).toBeLessThan(coreHp);
    run.bosses[0]!.t = 89.99;
    const dmg = run.w.wDamage[b]!;
    const enr = stepUntil(run, () => run.bosses[0]!.enraged, 5);
    expect(enr.find((e) => e.type === 'enrage')).toBeTruthy();
    expect(run.w.wDamage[b]).toBeCloseTo(dmg * 1.5);
  });

  it('telegraph is cancelled when its owner dies', () => {
    const run = newRun(1, TRIAL);
    run1(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const b = ctx.spawnEnemy('trial-brute', 600, 600);
    stepUntil(run, () => run.telegraphs.length > 0, 120);
    ctx.damage(b, 1e9, 0, run.hero);
    run1(run);
    expect(run.telegraphs).toHaveLength(0);
  });
});

describe('content validation', () => {
  it('rejects content that references an unregistered effect id', () => {
    const bad = patched((r) => { (r.cards as { effect: string }[])[0]!.effect = 'no-such-effect'; });
    expect(() => newRun(1, bad)).toThrow(/cardEffects: unknown id "no-such-effect"/);
  });

  it('rejects a wave that references an unknown enemy', () => {
    const bad = patched((r) => {
      ((r.worlds as { waves: { groups: { enemy: string }[] }[] }[])[0]!.waves[0]!.groups[0]!).enemy = 'ghost';
    });
    expect(() => newRun(1, bad)).toThrow(/unknown enemy "ghost"/);
  });
});

describe('view + score', () => {
  it('exposes entities with interpolation anchors and a live score', () => {
    const run = newRun();
    for (let i = 0; i < 5; i++) run1(run, quantizeMove(0, 1));
    const v = view(run);
    expect(v.entities.kind[v.hero]).toBe(Kind.Hero);
    expect(v.entities.y[v.hero]! - v.entities.prevY[v.hero]!).toBeCloseTo(170 / 30, 6);
    expect(score(run).grade).toBeDefined();
  });
});
