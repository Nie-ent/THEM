/**
 * Perf bench: steps the sim with N live enemies (default 500) swarming the Core, the hero firing,
 * an AI hero and 8 towers shooting. Enemies are topped back up to N every tick, so the count stays
 * constant while combat, projectiles, pickups and separation all run.
 *
 *   pnpm bench                 # 500 enemies, 900 steps
 *   pnpm bench -- 1000 600     # N enemies, steps
 *
 * Budget (CLAUDE.md): 500 enemies at 60 fps. The sim runs at 30 Hz, so a step must leave most of a
 * 16.7 ms frame for rendering; we flag anything above 4 ms/step. Exit code 1 if over budget.
 */
import { content } from '@them/content';
import { createRun, step } from '../src/api';
import { Kind } from '../src/constants';
import { getCtx } from '../src/sim';

const N = Number(process.argv[2] ?? 500);
const STEPS = Number(process.argv[3] ?? 900);
const WARMUP = 120;
const BUDGET_MS = 4;

const run = createRun({ worldId: 'garroth' }, content, 2024);
run.debugInvulnerable = true;
run.wood = run.stone = 10_000;
const towerCells = [4 * 13 + 6, 8 * 13 + 6, 6 * 13 + 4, 6 * 13 + 8, 2 * 13 + 2, 2 * 13 + 10, 10 * 13 + 2, 10 * 13 + 10];
for (const cell of towerCells) step(run, { moveX: 0, moveY: 0, build: { buildingId: 'archer-tower-wood', cell } });
step(run, { moveX: 0, moveY: 0, callWave: true });
run.spawnQueue.length = 0; // bench controls spawning itself
const ctx = getCtx(run);
const w = run.w;
const { width, height } = run.worldDef.arena;

function topUp(): void {
  let alive = 0;
  for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Enemy) alive++;
  for (let k = alive; k < N; k++) {
    const side = run.rng.int(4);
    const t = run.rng.range(0.1, 0.9);
    const x = side === 0 ? width * t : side === 1 ? width - 20 : side === 2 ? width * t : 20;
    const y = side === 0 ? 20 : side === 1 ? height * t : side === 2 ? height - 20 : height * t;
    ctx.spawnEnemy(k % 5 === 0 ? 'torch-bearer' : 'raider', x, y);
  }
}

// Fill the arena: run a while so enemies spread from the edges to the base.
for (let i = 0; i < WARMUP; i++) { topUp(); step(run, { moveX: (i % 60) < 30 ? 64 : -64, moveY: 0 }); run.events.length = 0; run.draft = null; run.pendingLevels = 0; }

const samples: number[] = [];
let hits = 0, deaths = 0;
for (let i = 0; i < STEPS; i++) {
  topUp();
  const t0 = performance.now();
  step(run, { moveX: (i % 60) < 30 ? 64 : -64, moveY: 0 });
  samples.push(performance.now() - t0);
  for (const ev of run.events) if (ev.type === "hit") hits++; else if (ev.type === "death") deaths++;
  run.events.length = 0;
  run.draft = null;
  run.pendingLevels = 0;
}

samples.sort((a, b) => a - b);
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
const p = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!;
let enemies = 0, projectiles = 0, pickups = 0;
for (let i = 0; i < w.highWater; i++) {
  if (w.kind[i] === Kind.Enemy) enemies++;
  else if (w.kind[i] === Kind.Projectile) projectiles++;
  else if (w.kind[i] === Kind.Pickup) pickups++;
}
console.log(`core bench: ${enemies} enemies, ${projectiles} projectiles, ${pickups} pickups at end; ${hits} hits, ${deaths} deaths over ${STEPS} steps`);
console.log(`ms/step  mean ${mean.toFixed(3)}  p50 ${p(0.5).toFixed(3)}  p95 ${p(0.95).toFixed(3)}  p99 ${p(0.99).toFixed(3)}  max ${samples[samples.length - 1]!.toFixed(3)}`);
console.log(`budget ${BUDGET_MS} ms/step (mean): ${mean <= BUDGET_MS ? 'OK' : 'OVER'}`);
if (mean > BUDGET_MS) process.exit(1);
