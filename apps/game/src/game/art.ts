/**
 * Placeholder geometric art (P1-09): every silhouette of docs/design/readability.md §4 is baked
 * once into a texture, with its 2 px (3 px in "thick" outline mode) `stage.outline` stroke. Entities
 * are pooled Images that only swap to a baked texture, so rendering a body costs one sprite and no
 * Graphics work. Colours come from `tokens.color.stage` only.
 *
 * Bake keys carry the outline weight (`enemy-3-o2`), so changing the setting just re-skins the pool.
 */
import Phaser from 'phaser';
import { content, type RenderHint } from '@them/content';
import { hexToInt, tokens } from '@them/ui-tokens';
import { SHAPES, type Poly } from './shapes';

const C = tokens.color.stage;
export const col = (hex: string): number => hexToInt(hex);

export interface Skin {
  key: string;
  /** Second animation frame (torch-bearer flame flicker, 4 Hz). */
  altKey?: string;
  depth: number;
  rotate: boolean;
}

/** Draw order (readability §1): ground, grid, telegraphs, structures + Core, pickups, enemies, allies, hero, projectiles, numbers, edge. */
export const DEPTH = {
  ground: 0, under: 1, structure: 2, pickup: 3, enemy: 4, ally: 5, hero: 6, projectile: 7, over: 8, numbers: 9, edge: 10,
} as const;

export interface SkinSet {
  enemy: Skin[];
  structure: Skin[];
  ally: Skin[];
  hero: Skin;
  core: Skin;
  projAlly: Skin;
  projEnemy: Skin;
  /** Indexed by PickupType (xp, wood, stone). */
  pickup: Skin[];
  fallback: Skin;
}

type Extra =
  | 'crown' | 'flame' | 'flame-off' | 'ticks' | 'plates' | 'streak' | 'planks' | 'bricks' | 'tower' | 'octagon' | 'pit' | 'core' | 'rounded';

interface BakeSpec {
  shape: RenderHint['shape'] | 'circle';
  poly?: Poly;
  r: number;
  fill: number;
  rim?: number;
  /** Outline thickness in px; 0 = none (pickups, telegraph-like). */
  outline: number;
  extras?: Extra[];
  /** Small front triangle cut-out for shapes whose rotation is otherwise invisible. */
  notch?: boolean;
  blot?: boolean;
}

/** Visual tweak so the on-screen size matches the spec table when the content radius differs. */
const VIS_SCALE: Partial<Record<RenderHint['shape'], number>> = { diamond: 0.85 };

function bake(scene: Phaser.Scene, key: string, spec: BakeSpec): void {
  if (scene.textures.exists(key)) return;
  const { r, outline } = spec;
  const streak = spec.extras?.includes('streak');
  const half = Math.ceil(Math.max(r * 1.55, streak ? r * 2.6 : 0) + outline + 3);
  const size = half * 2;
  const c = half;
  const g = scene.make.graphics({}, false);
  const dark = col(C.outline);
  const poly: Poly | 'circle' = spec.poly ?? (spec.shape === 'circle' ? 'circle' : SHAPES[spec.shape]);
  const pts = (k: number): Phaser.Math.Vector2[] =>
    poly === 'circle' ? [] : poly.map(([x, y]) => new Phaser.Math.Vector2(c + x * r * k, c + y * r * k));
  const rounded = spec.extras?.includes('rounded');

  const body = (k: number, color: number): void => {
    g.fillStyle(color, 1);
    if (poly === 'circle') g.fillCircle(c, c, r * k);
    else if (rounded) g.fillRoundedRect(c - r * k, c - r * k, r * 2 * k, r * 2 * k, 4);
    else g.fillPoints(pts(k), true);
  };

  if (spec.extras?.includes('pit')) {
    // Fire-pit trap: dashed ground ring in `burning`, 30% fill; no outline (it is a ground mark).
    g.fillStyle(spec.fill, 0.3).fillCircle(c, c, r - 2);
    const n = Math.max(6, Math.round((Math.PI * 2 * (r - 2)) / 14));
    g.lineStyle(2, spec.fill, 0.95);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      g.beginPath();
      g.arc(c, c, r - 2, a0, a0 + (Math.PI * 2 * 8) / (n * 14), false);
      g.strokePath();
    }
  } else if (spec.extras?.includes('core')) {
    // Core: a square turned 45 degrees inside a circle (HP ring is dynamic).
    g.lineStyle(outline * 2, dark, 1).strokeCircle(c, c, r);
    g.fillStyle(spec.fill, 0.28).fillCircle(c, c, r);
    g.lineStyle(3, spec.fill, 1).strokeCircle(c, c, r - 1.5);
    const sq = (k: number): Phaser.Math.Vector2[] => [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, y]) => new Phaser.Math.Vector2(c + x! * r * 0.62 * k, c + y! * r * 0.62 * k));
    g.lineStyle(outline * 2, dark, 1).strokePoints(sq(1), true, true);
    g.fillStyle(spec.fill, 1).fillPoints(sq(1), true);
  } else {
    if (outline > 0) {
      g.lineStyle(outline * 2, dark, 1);
      if (poly === 'circle') g.strokeCircle(c, c, r);
      else if (rounded) g.strokeRoundedRect(c - r, c - r, r * 2, r * 2, 4);
      else g.strokePoints(pts(1), true, true);
    }
    if (spec.rim !== undefined) { body(1, spec.rim); body(Math.max(0.4, 1 - 3 / r), spec.fill); } else body(1, spec.fill);
  }

  g.lineStyle(1.5, dark, 0.8);
  for (const x of spec.extras ?? []) {
    switch (x) {
      case 'crown':
        // Mini-boss crown: three spikes on the top edge (the sprite is not rotated for crowned bodies).
        for (const dx of [-0.55, 0, 0.55]) {
          const b = [c + dx * r - r * 0.2, c - r * 0.92, c + dx * r + r * 0.2, c - r * 0.92, c + dx * r, c - r * 1.42] as const;
          g.fillStyle(dark, 1).fillTriangle(b[0] - 1.5, b[1] + 1.5, b[2] + 1.5, b[3] + 1.5, b[4], b[5] - 2.5);
          g.fillStyle(col(C.enemy), 1).fillTriangle(b[0], b[1], b[2], b[3], b[4], b[5]);
        }
        break;
      case 'flame': g.fillStyle(col(C.burning), 1).fillCircle(c + r * 0.95, c, r * 0.36); break;
      case 'flame-off': g.fillStyle(col(C.burning), 1).fillCircle(c + r * 0.85, c, r * 0.22); break;
      case 'ticks':
        // Four radial ticks: dark underlay then enemy colour, so they read against the ground.
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
          g.lineStyle(4, dark, 1).lineBetween(c + dx * r * 0.8, c + dy * r * 0.8, c + dx * r * 1.4, c + dy * r * 1.4);
          g.lineStyle(2, col(C.enemy), 1).lineBetween(c + dx * r * 0.8, c + dy * r * 0.8, c + dx * r * 1.4, c + dy * r * 1.4);
        }
        break;
      case 'plates':
        g.lineStyle(2, dark, 0.8);
        g.lineBetween(c - r * 0.4, c - r * 0.5, c - r * 0.4, c + r * 0.5);
        g.lineBetween(c + r * 0.1, c - r * 0.5, c + r * 0.1, c + r * 0.5);
        break;
      case 'octagon':
        // Ring of 8 notches on the rim (Varkul).
        g.fillStyle(dark, 1);
        for (let k = 0; k < 8; k++) {
          const a = Math.PI / 8 + (k * Math.PI) / 4;
          const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
          const ix = c + Math.cos(a) * r * 0.82, iy = c + Math.sin(a) * r * 0.82;
          const nx = -Math.sin(a) * r * 0.07, ny = Math.cos(a) * r * 0.07;
          g.fillTriangle(px + nx, py + ny, px - nx, py - ny, ix, iy);
        }
        break;
      case 'streak':
        g.lineStyle(2, col(C.enemy), 0.8);
        g.lineBetween(c - r * 1.15, c - r * 0.35, c - r * 2.4, c - r * 0.35);
        g.lineBetween(c - r * 1.15, c + r * 0.35, c - r * 2.0, c + r * 0.35);
        break;
      case 'planks':
        g.lineStyle(1.5, dark, 0.8);
        for (let k = -1; k <= 1; k++) g.lineBetween(c - r, c + k * r * 0.5, c + r, c + k * r * 0.5);
        break;
      case 'bricks':
        g.lineStyle(1.5, dark, 0.8);
        for (let k = -1; k <= 1; k++) g.lineBetween(c - r, c + k * r * 0.5, c + r, c + k * r * 0.5);
        g.lineBetween(c, c - r, c, c - r * 0.5); g.lineBetween(c - r * 0.5, c - r * 0.5, c - r * 0.5, c);
        g.lineBetween(c + r * 0.5, c - r * 0.5, c + r * 0.5, c); g.lineBetween(c, c, c, c + r * 0.5);
        break;
      case 'tower': g.lineStyle(2, dark, 0.7).strokeCircle(c, c, r * 0.45); g.fillStyle(dark, 0.35).fillCircle(c, c, r * 0.45); break;
      default: break;
    }
  }
  if (spec.blot) {
    // The ink blot of Varkul (GDD §2): three overlapping dark ellipses.
    g.fillStyle(dark, 0.85);
    g.fillEllipse(c - r * 0.12, c + r * 0.05, r * 0.7, r * 0.5);
    g.fillEllipse(c + r * 0.15, c - r * 0.18, r * 0.4, r * 0.35);
    g.fillEllipse(c + r * 0.05, c + r * 0.3, r * 0.3, r * 0.22);
  }
  if (spec.notch) {
    g.fillStyle(dark, 1).fillTriangle(c + r * 1.02, c - r * 0.2, c + r * 1.02, c + r * 0.2, c + r * 0.68, c);
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

function enemySpec(d: (typeof content.enemies)[number], outline: number, flameOn = true): BakeSpec {
  const shape = d.render.shape;
  const armored = d.tier === 'miniboss' || d.tier === 'boss' || shape === 'hexagon';
  const extras: Extra[] = [];
  if (shape === 'triangle-flame') extras.push(flameOn ? 'flame' : 'flame-off');
  if (shape === 'circle-ticks') extras.push('ticks');
  if (shape === 'chevron') extras.push('streak');
  if (shape === 'hexagon') extras.push('plates');
  if (shape === 'octagon') extras.push('octagon');
  const crown = d.render.marks.includes('crown');
  if (crown) extras.push('crown');
  return {
    shape,
    r: d.radius * (VIS_SCALE[shape] ?? 1),
    fill: col(armored ? C.enemyElite : C.enemy),
    rim: armored ? col(C.enemy) : undefined,
    outline,
    extras,
    notch: !crown && !d.render.marks.includes('blot') && (shape === 'hexagon' || shape === 'octagon' || shape === 'circle-ticks' || shape === 'circle'),
    blot: d.render.marks.includes('blot'),
  };
}

const UP_TRIANGLE: Poly = [[0, -1.15], [0.95, 0.85], [-0.95, 0.85]];

/** Bake everything for one outline weight and return the skin lookup tables. */
export function bakeSkins(scene: Phaser.Scene, outline: number): SkinSet {
  const o = `-o${outline}`;
  const enemy: Skin[] = content.enemies.map((d, i) => {
    const key = `enemy-${i}${o}`;
    bake(scene, key, enemySpec(d, outline));
    const flame = d.render.shape === 'triangle-flame';
    if (flame) bake(scene, `${key}-b`, enemySpec(d, outline, false));
    // Crowned / blotted bodies stay upright so the crown and blot read; everything else faces its heading.
    const upright = d.render.marks.includes('crown') || d.render.marks.includes('blot');
    return { key, altKey: flame ? `${key}-b` : undefined, depth: DEPTH.enemy, rotate: !upright };
  });
  const structure: Skin[] = content.buildings.map((d, i) => {
    const key = `building-${i}${o}`;
    const extras: Extra[] = d.render.shape === 'square-planks' ? ['planks'] : d.render.shape === 'square-bricks' ? ['bricks'] : d.render.shape === 'square-tower' ? ['tower'] : ['pit'];
    const pit = d.render.shape === 'ring-dashed';
    bake(scene, key, {
      shape: pit ? 'circle' : 'square', r: pit ? 19 : 18, fill: col(pit ? C.burning : d.material === 'wood' ? C.structureWood : C.structureStone),
      outline: pit ? 0 : outline, extras,
    });
    return { key, depth: pit ? DEPTH.under - 0.5 : DEPTH.structure, rotate: false };
  });
  const ally: Skin[] = content.heroes.map((d, i) => {
    const key = `ally-${i}${o}`;
    bake(scene, key, { shape: 'square', r: d.radius, fill: col(C.ally), outline, extras: ['rounded'] });
    return { key, depth: DEPTH.ally, rotate: false };
  });
  const ph = content.balance.playerHero;
  bake(scene, `hero${o}`, { shape: 'circle', r: ph.radius, fill: col(C.hero), outline });
  bake(scene, `core${o}`, { shape: 'circle', r: content.worlds[0]!.core.radius, fill: col(C.core), outline, extras: ['core'] });
  bake(scene, `proj-ally${o}`, { shape: 'circle', r: 4, fill: col(C.allyProjectile), outline });
  bake(scene, `proj-enemy${o}`, { shape: 'circle', r: 4.5, fill: col(C.enemyProjectile), outline });
  // Pickups have no outline (readability §3). Stone points up and never rotates.
  bake(scene, 'pickup-xp', { shape: 'diamond', r: 3.4, fill: col(C.xpOrb), outline: 0 });
  bake(scene, 'pickup-wood', { shape: 'square', r: 4, fill: col(C.pickupWood), outline: 0 });
  bake(scene, 'pickup-stone', { shape: 'triangle', poly: UP_TRIANGLE, r: 4.4, fill: col(C.pickupStone), outline: 0 });
  const sk = (key: string, depth: number): Skin => ({ key, depth, rotate: false });
  return {
    enemy, structure, ally,
    hero: sk(`hero${o}`, DEPTH.hero),
    core: sk(`core${o}`, DEPTH.structure),
    projAlly: sk(`proj-ally${o}`, DEPTH.projectile),
    projEnemy: sk(`proj-enemy${o}`, DEPTH.projectile),
    pickup: [sk('pickup-xp', DEPTH.pickup), sk('pickup-wood', DEPTH.pickup), sk('pickup-stone', DEPTH.pickup)],
    fallback: sk(`hero${o}`, DEPTH.enemy),
  };
}
