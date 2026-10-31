/**
 * QA heuristic player for the headless balance bot (P1-10). Drives @them/core through the public API
 * only: `view`, `intel`, `step` inputs. Content-agnostic: it reads building/card/enemy defs from the
 * bundle and classifies them by data (behavior, material, flammable, tags, drawbackKey), so it keeps
 * working when P1-06 / P1-07 replace the stub content.
 *
 * Modes
 * - planner: builds a defence each prep from wave intel (towers on the threatened sides, walls in
 *   front; fireproof walls when the next wave has igniters), posts AI heroes on the heaviest side,
 *   then calls the wave early.
 * - no-build: identical movement / cards / call-early, never builds or moves AI heroes.
 *
 * The policy is a pure function of (run view, bot memory) so a run is reproducible from its seed.
 */
import type { BuildingDef, CardDef, ContentBundle, Side } from '../../packages/content/src/index';
import {
  Kind, intel, quantizeMove, view, type InputFrame, type Run, type RunView,
} from '../../packages/core/src/index';

export type Mode = 'planner' | 'no-build';

const RARITY: Record<CardDef['rarity'], number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];
const SIDE_VEC: Record<Side, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/** Distance from the Core the hero tries to stay within. */
const LEASH = 260;
/** Enemies inside this radius push the hero away (kiting). */
const DANGER = 110;
/** Pickups inside this radius (and inside the leash) attract the hero. */
const GREED = 220;

export interface BotMemory {
  mode: Mode;
  /** Wave number the current build plan was made for. */
  plannedWave: number;
  plan: { buildingId: string; cell: number }[];
  heroesPlaced: number;
}

export function newMemory(mode: Mode): BotMemory {
  return { mode, plannedWave: 0, plan: [], heroesPlaced: -1 };
}

/* ------------------------------------------------------------------------------------------ */
/* Cards                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function cardValue(c: CardDef, nextLevel: number): number {
  let v = RARITY[c.rarity];
  if (nextLevel > 1) v += 0.75; // stacking a card we already own is usually good
  if (c.drawbackKey) v -= 1.25;
  if (c.tags.includes('damage') || c.tags.includes('projectile')) v += 0.5;
  return v;
}

function pickCard(run: Run, v: RunView): InputFrame {
  const cards = run.content.cards;
  let best = 0, bestV = -Infinity;
  v.draft!.forEach((o, i) => {
    const c = cards.find((x) => x.id === o.cardId);
    const val = c ? cardValue(c, o.nextLevel) : 0;
    if (val > bestV) { bestV = val; best = i; }
  });
  // Reroll a weak offer while rerolls last.
  if (bestV < 1 && v.rerollsLeft > 0) return { moveX: 0, moveY: 0, reroll: true };
  return { moveX: 0, moveY: 0, pickCard: best };
}

/* ------------------------------------------------------------------------------------------ */
/* Build planning                                                                             */
/* ------------------------------------------------------------------------------------------ */

function isWall(b: BuildingDef): boolean {
  return b.behavior === 'static' && b.blocking;
}

/** Sides weighted by intel share (heaviest first), ties in N/E/S/W order. */
function threatSides(run: Run): { side: Side; share: number }[] {
  const it = intel(run);
  if (!it) return [];
  return SIDES.map((side) => ({ side, share: it.sides[side] })).filter((s) => s.share > 0).sort((a, b) => b.share - a.share);
}

function waveHasIgniters(run: Run): boolean {
  const it = intel(run);
  if (!it) return false;
  return it.enemies.some((e) => run.content.enemies.find((d) => d.id === e.enemyId)?.behaviors.some((b) => b.id === 'ignite'));
}

function affordable(run: Run, b: BuildingDef, reserveWood: number, reserveStone: number): boolean {
  return run.wood - reserveWood >= b.cost.wood && run.stone - reserveStone >= b.cost.stone;
}

/** Ring of buildable cells at Chebyshev distance `ring` from the Core cell, facing `side`. */
function sideCells(run: Run, side: Side, ring: number): number[] {
  const g = run.grid;
  const cc = Math.floor(g.cols / 2), cr = Math.floor(g.rows / 2);
  const [sx, sy] = SIDE_VEC[side];
  const out: { cell: number; off: number }[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const dx = c - cc, dy = r - cr;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
    // Facing: projection onto the side vector must be the full ring distance.
    if (dx * sx + dy * sy !== ring) continue;
    const cell = r * g.cols + c;
    if (!g.buildable[cell]) continue;
    out.push({ cell, off: Math.abs(dx * sy) + Math.abs(dy * sx) });
  }
  return out.sort((a, b) => a.off - b.off || a.cell - b.cell).map((o) => o.cell);
}

/** Per-wave upkeep of everything standing, so the bot does not bankrupt itself. */
function upkeepReserve(run: Run): { wood: number; stone: number } {
  const g = run.grid;
  let wood = 0, stone = 0;
  for (let c = 0; c < g.cell.length; c++) {
    const d = g.cellDef[c]!;
    if (d < 0) continue;
    const b = run.content.buildings[d]!;
    wood += b.upkeep.wood;
    stone += b.upkeep.stone;
  }
  return { wood, stone };
}

function makePlan(run: Run): { buildingId: string; cell: number }[] {
  const bs = run.content.buildings;
  const fire = waveHasIgniters(run);
  const offence = bs.filter((b) => !isWall(b));
  // Prefer fireproof walls when igniters come; otherwise the cheapest.
  const walls = bs.filter(isWall).sort((a, b) =>
    (fire ? Number(a.flammable) - Number(b.flammable) : 0) || (a.cost.wood + a.cost.stone) - (b.cost.wood + b.cost.stone));
  const towers = offence.filter((b) => b.behavior === 'tower').concat(offence.filter((b) => b.behavior !== 'tower'))
    .sort((a, b) => (fire ? Number(a.flammable) - Number(b.flammable) : 0));
  const plan: { buildingId: string; cell: number }[] = [];
  const sides = threatSides(run);
  // Round-robin over threatened sides: tower first, then a wall in front of it.
  for (let pass = 0; pass < 3; pass++) {
    for (const { side } of sides) {
      const t = towers[pass % Math.max(1, towers.length)];
      const tc = sideCells(run, side, 2)[pass];
      if (t && tc !== undefined) plan.push({ buildingId: t.id, cell: tc });
      const wl = walls[0];
      const wc = sideCells(run, side, 4)[pass];
      if (wl && wc !== undefined) plan.push({ buildingId: wl.id, cell: wc });
    }
  }
  return plan;
}

function nextBuild(run: Run, v: RunView, mem: BotMemory): InputFrame['build'] | undefined {
  if (v.wave !== mem.plannedWave) { mem.plan = makePlan(run); mem.plannedWave = v.wave; }
  if (v.grid.slotsUsed >= v.grid.maxSlots) return undefined;
  const reserve = upkeepReserve(run);
  for (const p of mem.plan) {
    if (v.grid.cell[p.cell] !== -1) continue;
    const b = run.content.buildings.find((x) => x.id === p.buildingId)!;
    if (affordable(run, b, reserve.wood + b.upkeep.wood, reserve.stone + b.upkeep.stone)) return p;
  }
  return undefined;
}

/* ------------------------------------------------------------------------------------------ */
/* Movement                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function moveVector(run: Run, v: RunView): { x: number; y: number } {
  const e = v.entities;
  const hx = e.x[v.hero]!, hy = e.y[v.hero]!;
  const cx = e.x[v.core]!, cy = e.y[v.core]!;
  let mx = 0, my = 0;

  // 1. Step out of any active telegraph (move away from its origin).
  for (const t of v.telegraphs) {
    if (!t.active) continue;
    const dx = hx - t.x, dy = hy - t.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < t.r + 30) { const s = d > 1e-6 ? 1 / d : 1; mx += dx * s * 3; my += dy * s * 3; }
  }

  // 2. Kite: repel from nearby enemies; remember the nearest enemy for "hunt" pull.
  let nearD = Infinity, nx = 0, ny = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== Kind.Enemy) continue;
    const dx = hx - e.x[i]!, dy = hy - e.y[i]!;
    const d = Math.sqrt(dx * dx + dy * dy) - e.radius[i]!;
    if (d < DANGER && d > 1e-6) { const k = (DANGER - d) / DANGER; mx += (dx / (d + e.radius[i]!)) * k * 2; my += (dy / (d + e.radius[i]!)) * k * 2; }
    // Hunt enemies that are close to the Core.
    const cdx = e.x[i]! - cx, cdy = e.y[i]! - cy, cd = cdx * cdx + cdy * cdy;
    if (cd < nearD) { nearD = cd; nx = e.x[i]!; ny = e.y[i]!; }
  }
  if (nearD < Infinity) {
    const dx = nx - hx, dy = ny - hy, d = Math.sqrt(dx * dx + dy * dy);
    // Close the gap to weapon range (~180 px) but no further.
    if (d > 180) { mx += (dx / d) * 0.8; my += (dy / d) * 0.8; }
  }

  // 3. Grab pickups inside the leash.
  let pD = GREED * GREED, px = 0, py = 0, havePick = false;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== Kind.Pickup) continue;
    const dx = e.x[i]! - hx, dy = e.y[i]! - hy, d2 = dx * dx + dy * dy;
    const ox = e.x[i]! - cx, oy = e.y[i]! - cy;
    if (d2 < pD && ox * ox + oy * oy < LEASH * LEASH) { pD = d2; px = dx; py = dy; havePick = true; }
  }
  if (havePick) { const d = Math.sqrt(pD) || 1; mx += (px / d) * 0.6; my += (py / d) * 0.6; }

  // 4. Leash to the Core.
  const lx = cx - hx, ly = cy - hy, ld = Math.sqrt(lx * lx + ly * ly);
  if (ld > LEASH) { const k = (ld - LEASH) / 60; mx += (lx / ld) * k; my += (ly / ld) * k; }

  const len = Math.sqrt(mx * mx + my * my);
  return len > 1e-3 ? { x: mx / len, y: my / len } : { x: 0, y: 0 };
}

/* ------------------------------------------------------------------------------------------ */
/* Policy                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export function botInput(run: Run, mem: BotMemory): InputFrame {
  const v = view(run);
  if (v.draft) return pickCard(run, v);

  if (v.phase === 'prep') {
    const input: InputFrame = { moveX: 0, moveY: 0 };
    // Walk back toward the Core during prep.
    const e = v.entities;
    const dx = e.x[v.core]! - e.x[v.hero]!, dy = e.y[v.core]! - e.y[v.hero]! + 80;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 20) Object.assign(input, quantizeMove(dx / d, dy / d));
    if (mem.mode === 'planner') {
      const sides = threatSides(run);
      if (mem.heroesPlaced !== v.wave && sides.length > 0 && run.config.allyHeroes.length > 0) {
        mem.heroesPlaced = v.wave;
        const [sx, sy] = SIDE_VEC[sides[0]!.side];
        const id = run.config.allyHeroes[0]!;
        input.placeHero = { heroId: id, x: e.x[v.core]! + sx * 120, y: e.y[v.core]! + sy * 120 };
        return input;
      }
      const b = nextBuild(run, v, mem);
      if (b) { input.build = b; return input; }
    }
    // Nothing left to do: call the wave early (speed score), after a short beat for the hero to walk back.
    if (v.prepTimeLeft < run.worldDef.prepSeconds - 1) input.callWave = true;
    return input;
  }

  return quantizeMoveVec(moveVector(run, v));
}

function quantizeMoveVec(m: { x: number; y: number }): { moveX: number; moveY: number } {
  return quantizeMove(m.x, m.y);
}

export type { ContentBundle };
