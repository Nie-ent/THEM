/**
 * Telegraph drawing (docs/design/readability.md §5). Always on the ground plane, under units.
 *
 * Wind-up: dashed outline (8 px dash, 6 px gap) in `telegraphWarn`, 20% fill that sweeps from the
 * origin outward as the timer runs. Commit (last `telegraphCommit` ms): solid `telegraphImpact`
 * outline, 45% fill, 45 degree hatch. Core-targeted attacks use `coreThreat` with a double outline
 * for the whole wind-up. The drawn area is the sim's nominal hitbox shape (circle r, rect length x
 * half-width, cone radius x half-angle, ring outer/inner); the engine adds the target's own radius.
 */
import Phaser from 'phaser';
import type { Telegraph } from '@them/core';
import { tokens } from '@them/ui-tokens';
import { col } from './art';

const C = tokens.color.stage;
const DASH = 8;
const GAP = 6;
const HATCH_STEP = 10;
const COMMIT_S = tokens.motion.duration.telegraphCommit / 1000;
const SQ = Math.SQRT1_2;

/** Plain-number copy of a telegraph, kept after the sim drops it so the impact flash can use it. */
export interface TeleShape {
  shape: Telegraph['shape'];
  x: number; y: number; r: number; r2: number; dx: number; dy: number; core: boolean;
}

export function copyShape(t: Readonly<Telegraph>, into?: TeleShape): TeleShape {
  const o = into ?? { shape: t.shape, x: 0, y: 0, r: 0, r2: 0, dx: 1, dy: 0, core: false };
  o.shape = t.shape; o.x = t.x; o.y = t.y; o.r = t.r; o.r2 = t.r2; o.dx = t.dx; o.dy = t.dy; o.core = t.targetsCore;
  return o;
}

type Pt = [number, number];

function rectPoly(s: TeleShape, len: number, inflate = 0): Pt[] {
  const nx = -s.dy, ny = s.dx, w = s.r2 + inflate;
  const l0 = -inflate, l1 = len + inflate;
  return [
    [s.x + s.dx * l0 + nx * w, s.y + s.dy * l0 + ny * w], [s.x + s.dx * l1 + nx * w, s.y + s.dy * l1 + ny * w],
    [s.x + s.dx * l1 - nx * w, s.y + s.dy * l1 - ny * w], [s.x + s.dx * l0 - nx * w, s.y + s.dy * l0 - ny * w],
  ];
}

function conePoly(s: TeleShape, radius: number): Pt[] {
  const base = Math.atan2(s.dy, s.dx);
  const half = Math.acos(Math.max(-1, Math.min(1, s.r2)));
  const pts: Pt[] = [[s.x, s.y]];
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const a = base - half + (2 * half * k) / n;
    pts.push([s.x + Math.cos(a) * radius, s.y + Math.sin(a) * radius]);
  }
  return pts;
}

function strokePoly(g: Phaser.GameObjects.Graphics, pts: Pt[], dashed: boolean): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    if (dashed) dashedLine(g, a[0], a[1], b[0], b[1]);
    else g.lineBetween(a[0], a[1], b[0], b[1]);
  }
}

function dashedLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  for (let t = 0; t < len; t += DASH + GAP) {
    const e = Math.min(t + DASH, len);
    g.lineBetween(x0 + ux * t, y0 + uy * t, x0 + ux * e, y0 + uy * e);
  }
}

function strokeCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, dashed: boolean): void {
  if (!dashed) { g.strokeCircle(x, y, r); return; }
  const step = (DASH + GAP) / Math.max(r, 1);
  const sweep = DASH / Math.max(r, 1);
  for (let a = 0; a < Math.PI * 2 - 1e-6; a += step) {
    g.beginPath();
    g.arc(x, y, r, a, a + sweep, false);
    g.strokePath();
  }
}

/** Hatch lines at 45 degrees clipped to a convex polygon (Cyrus-Beck). */
function hatchConvex(g: Phaser.GameObjects.Graphics, pts: Pt[]): void {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  let maxR = 0;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy));
  // Orientation sign so the inside test works for either winding.
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area >= 0 ? 1 : -1;
  for (let s = -maxR; s <= maxR; s += HATCH_STEP) {
    // Line through (cx,cy) + n*s along u = (SQ, -SQ), n = (SQ, SQ).
    const px = cx + SQ * s, py = cy + SQ * s;
    let t0 = -maxR * 2, t1 = maxR * 2;
    for (let i = 0; i < pts.length && t0 < t1; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const ex = b[0] - a[0], ey = b[1] - a[1];
      // Inside is to the left of each edge for sgn=+1: cross(e, p - a) * sgn >= 0.
      const num = sgn * (ex * (py - a[1]) - ey * (px - a[0]));
      const den = sgn * (ex * -SQ - ey * SQ);
      if (Math.abs(den) < 1e-9) { if (num < 0) t1 = t0 - 1; continue; }
      const t = -num / den;
      if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    }
    if (t0 < t1) g.lineBetween(px + SQ * t0, py - SQ * t0, px + SQ * t1, py - SQ * t1);
  }
}

/** Hatch an annulus (inner radius 0 = disc) with analytic chords. */
function hatchRing(g: Phaser.GameObjects.Graphics, x: number, y: number, ro: number, ri: number): void {
  for (let s = -ro; s <= ro; s += HATCH_STEP) {
    const px = x + SQ * s, py = y + SQ * s;
    const ho = Math.sqrt(Math.max(0, ro * ro - s * s));
    if (Math.abs(s) < ri) {
      const hi = Math.sqrt(ri * ri - s * s);
      g.lineBetween(px - SQ * ho, py + SQ * ho, px - SQ * hi, py + SQ * hi);
      g.lineBetween(px + SQ * hi, py - SQ * hi, px + SQ * ho, py - SQ * ho);
    } else g.lineBetween(px - SQ * ho, py + SQ * ho, px + SQ * ho, py - SQ * ho);
  }
}

/** Fill the (swept) area of a shape. `frac` 0..1 grows it from the origin outward. */
export function fillShape(g: Phaser.GameObjects.Graphics, s: TeleShape, frac: number, color: number, alpha: number): void {
  if (frac <= 0) return;
  g.fillStyle(color, alpha);
  switch (s.shape) {
    case 'circle': g.fillCircle(s.x, s.y, s.r * frac); break;
    case 'ring': {
      // Annulus as wedge quads: wide strokeCircle lines show miter spokes, so fill triangles instead.
      const out = s.r2 + (s.r - s.r2) * frac;
      const n = 40;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        g.fillTriangle(s.x + c0 * s.r2, s.y + s0 * s.r2, s.x + c0 * out, s.y + s0 * out, s.x + c1 * out, s.y + s1 * out);
        g.fillTriangle(s.x + c0 * s.r2, s.y + s0 * s.r2, s.x + c1 * out, s.y + s1 * out, s.x + c1 * s.r2, s.y + s1 * s.r2);
      }
      break;
    }
    case 'rect': g.fillPoints(rectPoly(s, s.r * frac).map(([x, y]) => new Phaser.Math.Vector2(x, y)), true); break;
    case 'cone': g.fillPoints(conePoly(s, s.r * frac).map(([x, y]) => new Phaser.Math.Vector2(x, y)), true); break;
  }
}

function outlineShape(g: Phaser.GameObjects.Graphics, s: TeleShape, grow: number, dashed: boolean): void {
  switch (s.shape) {
    case 'circle': strokeCircle(g, s.x, s.y, s.r + grow, dashed); break;
    case 'ring': strokeCircle(g, s.x, s.y, s.r + grow, dashed); strokeCircle(g, s.x, s.y, Math.max(1, s.r2 - grow), dashed); break;
    case 'rect': strokePoly(g, rectPoly(s, s.r, grow), dashed); break;
    case 'cone': strokePoly(g, conePoly(s, s.r + grow), dashed); break;
  }
}

/** Impact: one frame of white over the exact area, then a fading solid ring (150 ms). */
export function drawImpact(g: Phaser.GameObjects.Graphics, s: TeleShape, whiteFrame: boolean, fade: number): void {
  if (whiteFrame) { fillShape(g, s, 1, col(C.damageNormal), 0.75); return; }
  g.lineStyle(3, col(s.core ? C.coreThreat : C.telegraphImpact), fade);
  outlineShape(g, s, 0, false);
}

export function drawTelegraph(g: Phaser.GameObjects.Graphics, t: Readonly<Telegraph>, s: TeleShape): void {
  const commit = t.windup - t.t <= COMMIT_S;
  const color = col(s.core ? C.coreThreat : commit ? C.telegraphImpact : C.telegraphWarn);
  const frac = Math.min(1, t.t / t.windup);
  const dashed = !commit;
  const alpha = commit ? 0.45 : 0.2;

  // Fill: sweeps outward while winding up, complete during commit.
  fillShape(g, s, commit ? 1 : frac, color, alpha);

  // Outline: double for Core threats, solid in commit, dashed during wind-up.
  const widths = s.core ? [3, 3] : [2];
  for (let pass = 0; pass < widths.length; pass++) {
    g.lineStyle(widths[pass]!, color, 1);
    outlineShape(g, s, pass * 5, dashed);
  }

  if (commit) {
    g.lineStyle(1, color, 0.8);
    switch (s.shape) {
      case 'circle': hatchRing(g, s.x, s.y, s.r, 0); break;
      case 'ring': hatchRing(g, s.x, s.y, s.r, s.r2); break;
      case 'rect': hatchConvex(g, rectPoly(s, s.r)); break;
      case 'cone': hatchConvex(g, conePoly(s, s.r)); break;
    }
  }
}

