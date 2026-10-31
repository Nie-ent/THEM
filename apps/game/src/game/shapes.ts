/**
 * Unit-space silhouettes (docs/design/readability.md §4). Points are in units of the body radius,
 * facing +x. The renderer rotates them by the entity's facing vector and scales by radius.
 */
import type { RenderHint } from '@them/content';

export type Poly = readonly (readonly [number, number])[];

function regular(n: number, rot = 0): Poly {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}

export const SHAPES: Record<RenderHint['shape'] | 'triangle-up', Poly | 'circle'> = {
  circle: 'circle',
  'circle-ticks': 'circle',
  'ring-dashed': 'circle',
  triangle: [[1.15, 0], [-0.8, 0.85], [-0.8, -0.85]],
  /** Stone pickup / icon: point-up so it never reads as the point-forward raider. */
  'triangle-up': [[0, -1.15], [0.85, 0.8], [-0.85, 0.8]],
  'triangle-flame': [[1.15, 0], [-0.8, 0.85], [-0.8, -0.85]],
  hexagon: regular(6),
  octagon: regular(8, Math.PI / 8),
  diamond: [[1.2, 0], [0, 0.8], [-1.2, 0], [0, -0.8]],
  chevron: [[1.4, 0], [-1, 0.75], [-0.4, 0], [-1, -0.75]],
  square: [[1, 1], [-1, 1], [-1, -1], [1, -1]],
  'rounded-square': [[1, 1], [-1, 1], [-1, -1], [1, -1]],
  'square-planks': [[1, 1], [-1, 1], [-1, -1], [1, -1]],
  'square-bricks': [[1, 1], [-1, 1], [-1, -1], [1, -1]],
  'square-tower': [[1, 1], [-1, 1], [-1, -1], [1, -1]],
};

/** Scale a poly outward by `px` world units at radius `r` (for the 2 px outline pass). */
export function outlineScale(r: number, px: number): number {
  return (r + px) / r;
}
