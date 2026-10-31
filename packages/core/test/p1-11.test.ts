/** P1-11 engine fixes: soft-lock, engine burning, damage hook, spawn visibility, boss lines/stats, loss grade. */
import { describe, expect, it } from 'vitest';
import { content, loadContent, raw } from '@them/content';
import { createRun, drainEvents, score, step, view, type InputFrame, type Run, type SimEvent } from '../src/api';
import { DamageType, Flag, Kind } from '../src/constants';
import { cardEffects } from '../src/registry';
import { getCtx } from '../src/sim';

const idle: InputFrame = { moveX: 0, moveY: 0 };
const cell = (r: number, c: number) => r * 13 + c;

function newRun(seed = 1, allyHeroes: string[] = []): Run {
  return createRun({ worldId: 'garroth', allyHeroes }, content, seed);
}
function tick(run: Run, n = 1): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) { step(run, run.draft ? { ...idle, pickCard: 0 } : idle); all.push(...drainEvents(run)); }
  return all;
}
function pick(run: Run, cardId: string): void {
  run.draft = [{ cardId, nextLevel: 1 }];
  run.pendingLevels = 1;
  step(run, { ...idle, pickCard: 0 });
  drainEvents(run);
}

describe('QA-P1-10-003: ranged structure-hunters never target what they cannot hit', () => {
  it('a slinger ignores a lone fire-pit and goes for the Core; the wave resolves', () => {
    const run = newRun(3);
    run.debugInvulnerable = true;
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(2, 6) } });
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const ctx = getCtx(run);
    const pit = run.grid.cell[cell(2, 6)]!;
    const s = ctx.spawnEnemy('slinger', run.w.x[pit]!, run.w.y[pit]! - 200);
    tick(run, 2);
    expect(run.w.target[s]).toBe(run.core);
  });

  it('with walls present, a slinger targets the nearest blocking structure, never the trap', () => {
    const run = newRun(3);
    run.wood = run.stone = 100;
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(0, 6) } });
    step(run, { ...idle, build: { buildingId: 'stone-wall', cell: cell(12, 6) } });
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const ctx = getCtx(run);
    const pit = run.grid.cell[cell(0, 6)]!;
    const wall = run.grid.cell[cell(12, 6)]!;
    const s = ctx.spawnEnemy('slinger', run.w.x[pit]!, run.w.y[pit]! - 260);
    tick(run, 2);
    expect(run.w.target[s]).toBe(wall);
  });

  it('melee torch-bearers still hunt the trap (they can hit it)', () => {
    const run = newRun(3);
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(2, 6) } });
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const pit = run.grid.cell[cell(2, 6)]!;
    const t = getCtx(run).spawnEnemy('torch-bearer', run.w.x[pit]!, run.w.y[pit]! - 300);
    tick(run, 2);
    expect(run.w.target[t]).toBe(pit);
  });

  it('QA repro (seed 3, fire-pit only, hero idle): every wave resolves (cleared or lost), never stalls', () => {
    // QA used an invulnerable Core; then slingers correctly aiming at the Core could never end the
    // wave either. Here the Core takes damage and the hero is kept alive, like an AFK player.
    const run = newRun(3);
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: 32 } });
    drainEvents(run);
    let guard = 0, waveTicks = 0, longest = 0;
    while (run.waveIndex < 5 && run.phase !== 'ended' && guard++ < 30 * 60 * 30) {
      run.w.hp[run.hero] = run.w.maxHp[run.hero]!;
      step(run, run.draft ? { ...idle, pickCard: 0 } : run.phase === 'prep' ? { ...idle, callWave: true } : idle);
      drainEvents(run);
      waveTicks = run.phase === 'wave' ? waveTicks + 1 : 0;
      longest = Math.max(longest, waveTicks);
    }
    expect(run.waveIndex >= 5 || run.phase === 'ended').toBe(true);
    expect(longest).toBeLessThan(30 * 60 * 5); // no wave lasts 5 sim-minutes
  });

  it('point-blank hero shots hit (swept projectile collision, no tunnelling)', () => {
    const run = newRun();
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    drainEvents(run);
    const h = run.hero;
    const e = getCtx(run).spawnEnemy('raider', run.w.x[h]! + 12, run.w.y[h]! + 12);
    run.w.speed[e] = 0;
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    const ev = tick(run, 45);
    expect(ev.some((x) => x.type === 'hit' && x.e === e && x.source === h)).toBe(true);
  });
});

describe('enemy burning is an engine feature', () => {
  it('igniteEnemy emits ignite once, burns at world burnDps ignoring armor, emits end, clears Flag.Fire', () => {
    const run = newRun();
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    drainEvents(run);
    const ctx = getCtx(run);
    const b = ctx.spawnEnemy('brute', 400, 400);
    run.w.speed[b] = 0;
    run.w.hp[b] = run.w.maxHp[b] = 10_000;
    ctx.igniteEnemy(b, 1);
    ctx.igniteEnemy(b, 0.5); // shorter: no-op, no second ignite event
    let ev = drainEvents(run);
    expect(ev.filter((e) => e.type === 'burn')).toEqual([{ type: 'burn', e: b, uid: run.w.uid[b], kind: Kind.Enemy, state: 'ignite' }]);
    expect(run.w.flags[b]! & Flag.Fire).toBeTruthy();
    ev = tick(run, 30);
    expect(10_000 - run.w.hp[b]!).toBeCloseTo(run.worldDef.rules.burnDps, 5);
    expect(ev.some((e) => e.type === 'burn' && e.state === 'end' && e.e === b)).toBe(true);
    expect(run.w.flags[b]! & Flag.Fire).toBe(0);
    expect(ctx.isBurning(b)).toBe(false);
  });

  it('several fire sources never double the burn damage (fire-pit + ember ring + pitch arrows)', () => {
    const run = newRun();
    pick(run, 'ember-ring');
    pick(run, 'pitch-arrows');
    run.wood = run.stone = 100;
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(2, 2) } });
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    drainEvents(run);
    const ctx = getCtx(run);
    const far = ctx.spawnEnemy('raider', 2000, 2000);
    run.w.speed[far] = 0; run.w.flags[far] |= Flag.IgnoresAggro;
    run.w.hp[far] = run.w.maxHp[far] = 10_000;
    ctx.igniteEnemy(far, 10);
    tick(run, 30);
    expect(10_000 - run.w.hp[far]!).toBeCloseTo(run.worldDef.rules.burnDps, 5);
  });
});

describe('damage hook: nested ctx.damage from onHeroHit', () => {
  it('pitch-arrows bonus goes through ctx.damage, emits a hit, and a lethal bonus kills exactly once', () => {
    const run = newRun();
    pick(run, 'pitch-arrows');
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    drainEvents(run);
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', 400, 400);
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    ctx.igniteEnemy(e, 5);
    drainEvents(run);
    ctx.damage(e, 100, DamageType.Physical, run.hero);
    let ev = drainEvents(run);
    const hits = ev.filter((x) => x.type === 'hit' && x.e === e);
    expect(hits.map((h) => (h as { amount: number }).amount)).toEqual([100, 25]);
    expect(run.w.hp[e]).toBeCloseTo(875);
    // Lethal: main hit leaves 5 HP, bonus kills. One death, one kill counted.
    run.w.hp[e] = 105;
    const kills = run.kills.normal;
    ctx.damage(e, 100, DamageType.Physical, run.hero);
    ev = drainEvents(run);
    expect(ev.filter((x) => x.type === 'death' && x.e === e)).toHaveLength(1);
    expect(run.kills.normal).toBe(kills + 1);
    // Main hit already lethal: bonus is dropped, still exactly one death.
    const e2 = ctx.spawnEnemy('raider', 420, 400);
    ctx.igniteEnemy(e2, 5);
    drainEvents(run);
    ctx.damage(e2, 1e6, DamageType.Physical, run.hero);
    ev = drainEvents(run);
    expect(ev.filter((x) => x.type === 'death' && x.e === e2)).toHaveLength(1);
    expect(run.kills.normal).toBe(kills + 2);
  });

  it('queued damage never re-triggers onHeroHit (no feedback loop)', () => {
    let calls = 0;
    const id = 'test-echo-hit';
    if (!cardEffects.has(id)) {
      cardEffects.register({ id, onHeroHit(ctx, target, amount) { calls++; ctx.damage(target, amount, DamageType.Fire, ctx.run.hero); } });
    }
    const c = structuredClone(raw) as { cards: { effect: string; id: string }[] };
    c.cards[0]!.effect = id;
    const run = createRun({ worldId: 'garroth', allyHeroes: [] }, loadContent(c), 1);
    pick(run, c.cards[0]!.id);
    step(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', 400, 400);
    run.w.hp[e] = run.w.maxHp[e] = 1000;
    ctx.damage(e, 10, DamageType.Fire, run.hero);
    expect(calls).toBe(1);
    expect(run.w.hp[e]).toBeCloseTo(980);
  });
});

describe('spawned enemies are visible to area effects in the same tick', () => {
  it('nearestEnemy and hash queries see an enemy spawned this tick', () => {
    const run = newRun();
    step(run, { ...idle, callWave: true });
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', 500, 500);
    expect(ctx.nearestEnemy(500, 500, 10)).toBe(e);
  });

  it('a fire-pit damages an enemy spawned onto it before the pit ticks, on the first tick', () => {
    const run = newRun();
    step(run, { ...idle, build: { buildingId: 'fire-pit-trap', cell: cell(2, 2) } });
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const pit = run.grid.cell[cell(2, 2)]!;
    // Behaviour runs before structures in the step: spawn from an enemy behaviour tick by summoning
    // via the queue at the pit position on the next tick instead — simplest: spawn now, step once.
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('raider', run.w.x[pit]!, run.w.y[pit]!);
    run.w.speed[e] = 0;
    const ev = tick(run);
    expect(ev.some((x) => x.type === 'hit' && x.e === e && x.source === pit)).toBe(true);
  });
});

describe('boss lines and per-phase / stance stats', () => {
  it('emits intro on spawn, phase line, and defeat line with keys from bosses.json', () => {
    const run = newRun();
    run.debugInvulnerable = true;
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    drainEvents(run);
    const ctx = getCtx(run);
    const e = ctx.spawnEnemy('shield-chieftain', 900, 900);
    let ev = drainEvents(run);
    expect(ev.find((x) => x.type === 'bossLine')).toMatchObject({ moment: 'intro', key: 'boss.shield-chieftain.intro', bossId: 'shield-chieftain', phase: 0 });
    run.w.hp[e] = run.w.maxHp[e]! * 0.49;
    ev = tick(run);
    expect(ev.find((x) => x.type === 'bossLine')).toMatchObject({ moment: 'phase', key: 'boss.shield-chieftain.phase2', phase: 1 });
    ctx.damage(e, 1e9, DamageType.Fire, run.hero);
    ev = drainEvents(run);
    expect(ev.find((x) => x.type === 'bossLine')).toMatchObject({ moment: 'defeat', key: 'boss.shield-chieftain.defeat' });
  });

  it('every boss line key exists in content params', () => {
    for (const b of content.bosses) {
      expect(typeof b.params.introKey, b.id).toBe('string');
      expect(typeof b.params.defeatKey, b.id).toBe('string');
    }
  });

  it("Brannok's shield is a stance: the sim derives armor, the script never writes it", () => {
    const run = newRun();
    run.debugInvulnerable = true;
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const e = getCtx(run).spawnEnemy('shield-chieftain', 900, 900);
    const base = content.enemies.find((x) => x.id === 'shield-chieftain')!.armor;
    expect(run.w.armor[e]).toBe(base);
    let guard = 0;
    while (run.bosses[0]!.stance !== 'shield' && guard++ < 300) tick(run);
    expect(run.w.armor[e]).toBe(0.85);
    expect(view(run).bosses[0]!.stance).toBe('shield');
    guard = 0;
    while (run.bosses[0]!.stance !== '' && guard++ < 300) tick(run);
    expect(run.w.armor[e]).toBe(base);
  });

  it('phase and enrage stats compose: phase armor/speed/damage × stance × enrage', () => {
    const c = structuredClone(raw) as { bosses: Record<string, unknown>[] };
    const sc = c.bosses.find((b) => b.id === 'shield-chieftain')!;
    (sc.phases as Record<string, unknown>[])[1] = { ...(sc.phases as Record<string, unknown>[])[1], armor: 0.4, speedMult: 2, damageMult: 3 };
    const run = createRun({ worldId: 'garroth', allyHeroes: [] }, loadContent(c), 1);
    run.debugInvulnerable = true;
    step(run, { ...idle, callWave: true });
    run.spawnQueue.length = 0;
    const ed = content.enemies.find((x) => x.id === 'shield-chieftain')!;
    const e = getCtx(run).spawnEnemy('shield-chieftain', 900, 900);
    const b = run.bosses[0]!;
    run.w.hp[e] = run.w.maxHp[e]! * 0.49;
    tick(run);
    getCtx(run).bossStance(b, null);
    expect(run.w.armor[e]).toBe(0.4);
    expect(run.w.speed[e]).toBeCloseTo(ed.speed * 2);
    expect(run.w.wDamage[e]).toBeCloseTo(ed.weapon.damage * 3);
    getCtx(run).bossStance(b, 'shield');
    expect(run.w.armor[e]).toBe(0.85);
    b.t = 1e6;
    tick(run);
    const bd = run.idx.bosses[b.def]!;
    expect(run.w.speed[e]).toBeCloseTo(ed.speed * 2 * bd.enrageSpeedMult);
    expect(run.w.wDamage[e]).toBeCloseTo(ed.weapon.damage * 3 * bd.enrageDamageMult);
    expect(() => getCtx(run).bossStance(b, 'nope')).toThrow(/no stance "nope"/);
  });
});

describe('QA-P1-10-004: a lost run grades C (owner decision)', () => {
  it('losing on wave 2 fast is C with 60% reward; the score is still computed', () => {
    const run = newRun(1);
    let guard = 0;
    while (run.phase !== 'ended' && guard++ < 30 * 60 * 10) {
      if (run.waveIndex >= 1 && run.phase === 'wave') { getCtx(run).damage(run.core, 1e9, DamageType.Fire, -1); }
      step(run, run.draft ? { ...idle, pickCard: 0 } : run.phase === 'prep' ? { ...idle, callWave: true } : idle);
      drainEvents(run);
    }
    expect(run.result).toBe('lose');
    expect(run.waveIndex + 1).toBe(2);
    const s = score(run);
    expect(s.mSpeed).toBeCloseTo(1.3); // would be grade A/S without the cap
    expect(s.grade).toBe('C');
    expect(s.rewardPct).toBe(60);
    expect(s.total).toBeGreaterThan(0);
  });
});
