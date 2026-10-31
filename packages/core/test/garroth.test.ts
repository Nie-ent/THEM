/** P1-06 World 1 content: enemy behaviours, boss phases, and a full 20-wave run. */
import { describe, expect, it } from 'vitest';
import { content } from '@them/content';
import { createRun, drainEvents, intel, step, view, type InputFrame, type Run, type SimEvent } from '../src/api';
import { Flag, Kind } from '../src/constants';
import { getCtx } from '../src/sim';
import { playScripted } from './bot';

const idle: InputFrame = { moveX: 0, moveY: 0 };
const cell = (r: number, c: number) => r * 13 + c;

function waveRun(seed = 1): Run {
  const run = createRun({ worldId: 'garroth' }, content, seed);
  step(run, { ...idle, callWave: true });
  drainEvents(run);
  return run;
}
function tick(run: Run, n = 1): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) { step(run, run.draft ? { ...idle, pickCard: 0 } : idle); all.push(...drainEvents(run)); }
  return all;
}
function until(run: Run, pred: () => boolean, max = 600): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !pred(); i++) all.push(...tick(run));
  return all;
}
/** Park a freshly spawned enemy so only the behaviour under test acts on it. */
function freeze(run: Run, e: number): void { run.w.speed[e] = 0; }

describe('World 1 enemies', () => {
  it('brute resists physical damage and takes full fire damage', () => {
    const run = waveRun();
    const ctx = getCtx(run);
    const b = ctx.spawnEnemy('brute', 300, 300);
    const hp = run.w.hp[b]!;
    ctx.damage(b, 100, 0, run.hero);
    expect(hp - run.w.hp[b]!).toBeCloseTo(100 * (1 - 0.55), 5);
    const hp2 = run.w.hp[b]!;
    ctx.damage(b, 100, 1, run.hero);
    expect(hp2 - run.w.hp[b]!).toBeCloseTo(100, 5);
  });

  it('slinger stays back and fires at a structure from beyond tower range after an aim delay', () => {
    const run = createRun({ worldId: 'garroth' }, content, 1);
    step(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(0, 0) } });
    step(run, { ...idle, callWave: true });
    drainEvents(run);
    const wall = run.grid.cell[cell(0, 0)]!;
    const ctx = getCtx(run);
    const s = ctx.spawnEnemy('slinger', run.w.x[wall]! + 300, run.w.y[wall]!);
    run.w.flags[s] |= Flag.IgnoresAggro;
    const tower = content.buildings.find((b) => b.id === 'archer-tower-wood')!;
    const ev = until(run, () => run.w.hp[wall]! < run.w.maxHp[wall]!, 300);
    const dx = run.w.x[s]! - run.w.x[wall]!;
    expect(Math.abs(dx)).toBeGreaterThan(Number(tower.params.range)); // out-ranges the archer tower
    expect(ev.some((e) => e.type === 'hit' && e.e === wall)).toBe(true);
    expect(run.w.flags[s]! & Flag.Ranged).toBeTruthy();
  });

  it('wolf rider ignores the hero standing in its path and dives the Core', () => {
    const run = waveRun();
    const ctx = getCtx(run);
    const w = run.w;
    const wolf = ctx.spawnEnemy('wolf-rider', w.x[run.core]! + 400, w.y[run.core]!);
    w.x[run.hero] = w.x[run.core]! + 200; w.y[run.hero] = w.y[run.core]!;
    tick(run, 3);
    expect(w.target[wolf]).toBe(run.core);
    const raider = ctx.spawnEnemy('raider', w.x[run.hero]! + 50, w.y[run.hero]!);
    tick(run, 1);
    expect(w.target[raider]).toBe(run.hero); // control: normal enemies are pulled by aggro
    expect(content.enemies.find((e) => e.id === 'wolf-rider')!.speed).toBeGreaterThan(2 * content.enemies.find((e) => e.id === 'raider')!.speed);
  });

  it('war drummer buffs nearby allies, only while alive, and does not stack on itself', () => {
    const run = waveRun();
    const ctx = getCtx(run);
    const w = run.w;
    const d = ctx.spawnEnemy('war-drummer', 1200, 300);
    const near = ctx.spawnEnemy('raider', 1260, 300);
    const far = ctx.spawnEnemy('raider', 1500, 300);
    for (const e of [d, near, far]) freeze(run, e);
    tick(run);
    expect(w.buff[near]).toBeCloseTo(1.3);
    expect(w.speedBuff[near]).toBeCloseTo(1.2);
    expect(w.buff[far]).toBe(1);
    expect(w.buff[d]).toBe(1);
    ctx.damage(d, 1e6, 0, run.hero);
    tick(run);
    expect(w.buff[near]).toBe(1);
  });

  it('torch-bearer still ignites wood and stone resists', () => {
    const run = createRun({ worldId: 'garroth' }, content, 1);
    step(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(0, 0) } });
    step(run, { ...idle, callWave: true });
    drainEvents(run);
    const stone = run.grid.cell[cell(0, 0)]!;
    const ctx = getCtx(run);
    ctx.spawnEnemy('torch-bearer', run.w.x[stone]! + 30, run.w.y[stone]!);
    const ev = until(run, () => false, 90);
    expect(ev.some((e) => e.type === 'burn' && e.state === 'resist')).toBe(true);
    expect(run.w.burnT[stone]).toBe(0);
  });
});

describe('mini-bosses', () => {
  function boss(id: string, x = 900, y = 900) {
    const run = waveRun();
    run.debugInvulnerable = true;
    const e = getCtx(run).spawnEnemy(id, x, y);
    return { run, e };
  }
  const tele = (run: Run) => run.telegraphs.filter((t) => t.active);

  it('shield-chieftain: shield raises armor, drops it again, bashes with a cone, calls raiders in phase 2', () => {
    const { run, e } = boss('shield-chieftain');
    const base = run.w.armor[e]!;
    until(run, () => run.w.armor[e]! > base, 200);
    expect(run.w.armor[e]).toBeCloseTo(0.85);
    const shapes = new Set<string>();
    for (let i = 0; i < 30 * 12; i++) { tick(run); for (const t of tele(run)) shapes.add(t.shape); }
    expect(shapes.has('cone')).toBe(true);
    expect(run.w.armor[e] === base || run.w.armor[e] === 0.85).toBe(true);
    until(run, () => run.w.armor[e]! === base, 200);
    expect(run.w.armor[e]).toBe(base);
    run.w.hp[e] = run.w.maxHp[e]! * 0.49;
    const ev = tick(run);
    expect(ev.find((x) => x.type === 'bossPhase')).toMatchObject({ phase: 1, bossId: 'shield-chieftain' });
    const raiders = () => [...Array(run.w.highWater).keys()].filter((i) => run.w.kind[i] === Kind.Enemy && run.w.def[i] === run.idx.enemyIdx.get('raider')).length;
    const before = raiders();
    until(run, () => raiders() > before, 300);
    expect(raiders()).toBeGreaterThan(before);
  });

  it('beast-master: howl telegraph then wolves arrive; phase 2 calls a bigger pack', () => {
    const { run, e } = boss('beast-master');
    const wolfDef = run.idx.enemyIdx.get('wolf-rider')!;
    const wolves = () => [...Array(run.w.highWater).keys()].filter((i) => run.w.kind[i] === Kind.Enemy && run.w.def[i] === wolfDef).length;
    until(run, () => run.telegraphs.some((t) => t.shape === 'circle' && t.owner === e), 300);
    expect(wolves()).toBe(0);
    until(run, () => wolves() > 0, 120);
    expect(wolves()).toBe(3);
    run.w.hp[e] = run.w.maxHp[e]! * 0.49;
    expect(tick(run).find((x) => x.type === 'bossPhase')).toMatchObject({ phase: 1 });
    // Count spawn events (wolves already out may be shot meanwhile).
    const ev: SimEvent[] = [];
    let spawned = 0;
    for (let i = 0; i < 30 * 14 && spawned === 0; i++) {
      // Keep the boss alive in phase 2: the P1-07 kit kills it before the pack call otherwise.
      run.w.hp[e] = Math.max(run.w.hp[e]!, run.w.maxHp[e]! * 0.4);
      ev.push(...tick(run));
      spawned = ev.filter((x) => x.type === 'spawn' && x.def === wolfDef).length;
    }
    expect(spawned).toBe(5);
  });

  it('fire-priest: mass ignition lands on wood, stone resists, aimed at the Core', () => {
    const run = createRun({ worldId: 'garroth' }, content, 1);
    step(run, { ...idle, build: { buildingId: 'wood-wall', cell: cell(3, 6) } });
    step(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(3, 8) } });
    step(run, { ...idle, callWave: true });
    drainEvents(run);
    run.debugInvulnerable = true;
    const wood = run.grid.cell[cell(3, 6)]!, stone = run.grid.cell[cell(3, 8)]!;
    const e = getCtx(run).spawnEnemy('fire-priest', 1800, 1800);
    run.w.speed[e] = 0;
    until(run, () => run.telegraphs.some((t) => t.targetsCore), 400);
    const t = run.telegraphs.find((x) => x.targetsCore)!;
    expect(t.windup).toBeGreaterThanOrEqual(0.7);
    expect(run.w.burnT[wood]).toBe(0);
    const ev = until(run, () => run.w.burnT[wood]! > 0, 120);
    expect(run.w.burnT[wood]).toBeGreaterThan(0);
    expect(run.w.burnT[stone]).toBe(0);
    expect(ev.some((x) => x.type === 'burn' && x.state === 'resist')).toBe(true);
    run.w.hp[e] = run.w.maxHp[e]! * 0.49;
    expect(tick(run).find((x) => x.type === 'bossPhase')).toMatchObject({ phase: 1 });
  });
});

describe('Varkul', () => {
  function setup() {
    const run = waveRun();
    run.debugInvulnerable = true;
    const e = getCtx(run).spawnEnemy('varkul', 1500, 1500);
    run.w.speed[e] = 0;
    return { run, e };
  }

  it('every telegraph he ever casts winds up for at least 0.7 s', () => {
    const { run, e } = setup();
    const seen = new Set<number>();
    for (const hp of [1, 0.6, 0.3]) {
      run.w.hp[e] = run.w.maxHp[e]! * hp;
      for (let i = 0; i < 30 * 25; i++) {
        tick(run);
        for (const t of run.telegraphs) seen.add(t.id);
        for (const t of run.telegraphs) expect(t.windup).toBeGreaterThanOrEqual(0.7);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('phase 0 -> 1 -> 2 transitions, each adding attacks and a war-call', () => {
    const { run, e } = setup();
    const ents = () => [...Array(run.w.highWater).keys()].filter((i) => run.w.kind[i] === Kind.Enemy).length;
    // Phase 0: cleave only, never a Core attack.
    until(run, () => run.telegraphs.some((t) => t.shape === 'cone'), 200);
    tick(run, 30 * 12);
    expect(run.telegraphs.some((t) => t.targetsCore)).toBe(false);
    expect(run.bosses[0]!.phase).toBe(0);

    let n = ents();
    run.w.hp[e] = run.w.maxHp[e]! * 0.65;
    expect(tick(run).find((x) => x.type === 'bossPhase')).toMatchObject({ phase: 1, bossId: 'varkul' });
    expect(ents()).toBeGreaterThan(n); // war-call fires on the transition
    const lance = (() => { until(run, () => run.telegraphs.some((t) => t.targetsCore), 30 * 6); return run.telegraphs.find((t) => t.targetsCore)!; })();
    expect(lance.shape).toBe('rect');
    expect(lance.windup).toBeGreaterThanOrEqual(1.5);
    // Phase 1 has no ring quake or mass ignition yet.
    expect(run.telegraphs.some((t) => t.shape === 'ring')).toBe(false);

    n = ents();
    run.w.hp[e] = run.w.maxHp[e]! * 0.32;
    expect(tick(run).find((x) => x.type === 'bossPhase')).toMatchObject({ phase: 2 });
    expect(ents()).toBeGreaterThan(n);
    let sawRing = false, sawCross = false, sawPyre = false;
    for (let i = 0; i < 30 * 20; i++) {
      tick(run);
      if (run.telegraphs.some((t) => t.shape === 'ring')) sawRing = true;
      if (run.telegraphs.filter((t) => t.targetsCore && t.shape === 'rect').length >= 2) sawCross = true;
      if (run.telegraphs.some((t) => t.targetsCore && t.shape === 'circle')) sawPyre = true;
    }
    expect([sawRing, sawCross, sawPyre]).toEqual([true, true, true]);
  });

  it('a Core lance really hurts the Core, so it must be dodged by killing or body-blocking, not ignored', () => {
    const { run } = setup();
    run.debugInvulnerable = false;
    run.bosses[0]!.phase = 1;
    run.w.hp[run.bosses[0]!.e] = run.w.maxHp[run.bosses[0]!.e]! * 0.65;
    const hp = run.w.hp[run.core]!;
    until(run, () => run.telegraphs.some((t) => t.targetsCore), 30 * 8);
    const t = run.telegraphs.find((x) => x.targetsCore)!;
    until(run, () => !run.telegraphs.includes(t), 30 * 4);
    expect(run.w.hp[run.core]).toBeLessThan(hp);
  });

  it('enrage fires at the timer, boosts damage and speed, and halves cooldowns', () => {
    const { run, e } = setup();
    const bd = content.bosses.find((b) => b.id === 'varkul')!;
    expect(bd.enrageSeconds).toBeGreaterThan(0);
    run.bosses[0]!.t = bd.enrageSeconds - 0.01;
    const dmg = run.w.wDamage[e]!;
    const ev = until(run, () => run.bosses[0]!.enraged, 5);
    expect(ev.find((x) => x.type === 'enrage')).toBeTruthy();
    expect(run.w.wDamage[e]).toBeCloseTo(dmg * bd.enrageDamageMult);
    expect(run.bosses[0]!.state.cdMult).toBe(0.5);
  });
});

describe('World 1 waves', () => {
  const world = content.worlds.find((w) => w.id === 'garroth')!;

  it('has 20 waves with minibosses on 5/10/15 and Varkul on 20', () => {
    expect(world.waves).toHaveLength(20);
    const kinds = world.waves.map((w) => w.kind);
    expect(kinds.flatMap((k, i) => (k === 'miniboss' ? [i + 1] : []))).toEqual([5, 10, 15]);
    expect(kinds[19]).toBe('boss');
    expect(world.waves[19]!.groups.some((g) => g.enemy === 'varkul')).toBe(true);
  });

  it('teaches first (waves 1-4 only use basic enemies), then mixes every counter', () => {
    const run = createRun({ worldId: 'garroth' }, content, 1);
    const types = (n: number) => new Set(intel(run, n)!.enemies.map((e) => e.enemyId));
    expect(types(1)).toEqual(new Set(['raider']));
    for (const n of [1, 2, 3, 4]) expect(types(n).has('brute')).toBe(false);
    const late = new Set<string>();
    for (let n = 6; n <= 19; n++) types(n).forEach((t) => late.add(t));
    for (const id of ['raider', 'torch-bearer', 'brute', 'slinger', 'wolf-rider', 'war-drummer']) expect(late.has(id)).toBe(true);
    // Intel always reports a side share that sums to 1, and later waves attack from 3+ sides.
    for (let n = 1; n <= 20; n++) expect(Object.values(intel(run, n)!.sides).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Object.values(intel(run, 18)!.sides).filter((s) => s > 0).length).toBeGreaterThanOrEqual(3);
  });

  it('the scripted run clears all 20 waves and kills Varkul', () => {
    const { run } = playScripted(content, 7, 30 * 60 * 40);
    expect(run.phase).toBe('ended');
    expect(run.result).toBe('win');
    expect(view(run).wave).toBe(20);
    expect(run.bossKilled).toBe(true);
    expect(run.kills.miniboss).toBe(3);
  });
});
