/**
 * Stage VFX helpers (P1-09): bitmap damage numbers with the §7 cap and merge rules, hit sparks and
 * edge indicators. Everything is pooled and allocated once; nothing allocates per frame.
 */
import type Phaser from 'phaser';
import { hexToInt, tokens } from '@them/ui-tokens';

const C = tokens.color.stage;
const col = (hex: string): number => hexToInt(hex);

export const MAX_NUMBERS = 24;
const GLYPHS = '0123456789+-.';
const CELL_W = 15;
const CELL_H = 26;
const FONT_PX = 18;
const RISE_PX = 16;
const LIFE_S = 0.6;
const FADE_S = 0.2;

export type NumberKind = 'normal' | 'crit' | 'taken';

const KIND_STYLE: Record<NumberKind, { tint: number; size: number }> = {
  normal: { tint: col(C.damageNormal), size: 14 },
  crit: { tint: col(C.damageCrit), size: 18 },
  taken: { tint: col(C.damageTaken), size: 16 },
};

/**
 * Pre-render the digit glyphs once into a canvas texture and register it as a Phaser bitmap font
 * (white fill, 2 px `outline` stroke, tabular advance), so a number costs no text layout. Colour is
 * applied per object with a tint.
 */
function registerFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists('dmg')) return;
  const w = CELL_W * GLYPHS.length;
  const tex = scene.textures.createCanvas('dmgfont', w, CELL_H)!;
  const ctx = tex.getContext();
  ctx.font = `700 ${FONT_PX}px ${tokens.font.family.text}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const chars: Record<number, unknown> = {};
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = i * CELL_W + CELL_W / 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.outline;
    ctx.strokeText(GLYPHS[i]!, cx, CELL_H / 2 + 1);
    ctx.fillStyle = C.damageNormal;
    ctx.fillText(GLYPHS[i]!, cx, CELL_H / 2 + 1);
    const code = GLYPHS.charCodeAt(i);
    const x = i * CELL_W;
    chars[code] = {
      x, y: 0, width: CELL_W, height: CELL_H, centerX: Math.floor(CELL_W / 2), centerY: Math.floor(CELL_H / 2),
      xOffset: 0, yOffset: 0, xAdvance: CELL_W - 2, data: {}, kerning: {},
      u0: x / w, v0: 1, u1: (x + CELL_W) / w, v1: 0,
    };
  }
  tex.refresh();
  scene.cache.bitmapFont.add('dmg', {
    data: { font: 'dmg', size: FONT_PX, lineHeight: CELL_H, chars },
    texture: 'dmgfont',
    frame: null,
  });
}

export class DamageNumbers {
  private readonly text: Phaser.GameObjects.BitmapText[] = [];
  private readonly uid = new Float64Array(MAX_NUMBERS);
  private readonly kind: NumberKind[] = new Array<NumberKind>(MAX_NUMBERS).fill('normal');
  private readonly value = new Float64Array(MAX_NUMBERS);
  private readonly age = new Float64Array(MAX_NUMBERS).fill(-1);
  private readonly x = new Float64Array(MAX_NUMBERS);
  private readonly y = new Float64Array(MAX_NUMBERS);

  constructor(scene: Phaser.Scene, depth: number) {
    registerFont(scene);
    for (let i = 0; i < MAX_NUMBERS; i++) {
      this.text.push(scene.add.bitmapText(0, 0, 'dmg', '', FONT_PX).setOrigin(0.5).setDepth(depth).setVisible(false));
    }
  }

  /** Number of numbers currently on screen (never exceeds MAX_NUMBERS). */
  get live(): number {
    let n = 0;
    for (let i = 0; i < MAX_NUMBERS; i++) if (this.age[i]! >= 0) n++;
    return n;
  }

  /** Add or merge. A target that already shows a number of this kind adds to it and refreshes its timer. */
  add(targetUid: number, x: number, y: number, amount: number, kind: NumberKind): void {
    let free = -1, oldest = -1, oldestAge = -1;
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (this.age[i]! < 0) { if (free < 0) free = i; continue; }
      if (this.uid[i] === targetUid && this.kind[i] === kind) {
        this.value[i]! += amount; this.age[i] = 0; this.x[i] = x; this.y[i] = y;
        this.text[i]!.setText(String(Math.max(1, Math.round(this.value[i]!))));
        return;
      }
      if (this.age[i]! > oldestAge) { oldestAge = this.age[i]!; oldest = i; }
    }
    // Full: damage taken may evict the oldest number; everything else is dropped.
    const slot = free >= 0 ? free : kind === 'taken' ? oldest : -1;
    if (slot < 0) return;
    this.uid[slot] = targetUid; this.kind[slot] = kind; this.value[slot] = amount; this.age[slot] = 0;
    this.x[slot] = x; this.y[slot] = y;
    const st = KIND_STYLE[kind];
    this.text[slot]!.setText(String(Math.max(1, Math.round(amount)))).setFontSize(st.size).setTint(st.tint).setVisible(true);
  }

  update(dt: number, popCrit: boolean): void {
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (this.age[i]! < 0) continue;
      const a = (this.age[i]! += dt);
      const t = this.text[i]!;
      if (a >= LIFE_S) { this.age[i] = -1; t.setVisible(false); continue; }
      t.setPosition(this.x[i]!, this.y[i]! - RISE_PX * Math.min(1, a / LIFE_S));
      t.setAlpha(a > LIFE_S - FADE_S ? (LIFE_S - a) / FADE_S : 1);
      t.setScale(popCrit && this.kind[i] === 'crit' && a < 0.1 ? 1.1 : 1);
    }
  }

  /** Drop everything that is not damage taken (load shedding step 3). */
  shedNonTaken(): void {
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (this.age[i]! >= 0 && this.kind[i] !== 'taken') { this.age[i] = -1; this.text[i]!.setVisible(false); }
    }
  }

  clear(): void {
    for (let i = 0; i < MAX_NUMBERS; i++) { this.age[i] = -1; this.text[i]!.setVisible(false); }
  }
}

/** A pool of short-lived hit sparks (4 short white lines). First thing dropped under load. */
export class Sparks {
  private static readonly N = 48;
  private readonly x = new Float64Array(Sparks.N);
  private readonly y = new Float64Array(Sparks.N);
  private readonly t = new Float64Array(Sparks.N).fill(-1);
  private readonly big = new Uint8Array(Sparks.N);
  private head = 0;

  add(x: number, y: number, big = false): void {
    const i = this.head;
    this.head = (this.head + 1) % Sparks.N;
    this.x[i] = x; this.y[i] = y; this.t[i] = 0; this.big[i] = big ? 1 : 0;
  }

  draw(g: Phaser.GameObjects.Graphics, dt: number): void {
    g.lineStyle(2, col(C.damageNormal), 1);
    for (let i = 0; i < Sparks.N; i++) {
      if (this.t[i]! < 0) continue;
      const a = (this.t[i]! += dt);
      if (a > 0.12) { this.t[i] = -1; continue; }
      const r0 = (this.big[i] ? 5 : 3) + a * 40, r1 = r0 + (this.big[i] ? 6 : 4);
      const x = this.x[i]!, y = this.y[i]!;
      g.lineBetween(x - r0, y, x - r1, y); g.lineBetween(x + r0, y, x + r1, y);
      g.lineBetween(x, y - r0, x, y - r1); g.lineBetween(x, y + r0, x, y + r1);
    }
  }
}

/**
 * Edge arrow for a world point outside `view` (the HUD-safe rectangle from StageScene.safeRect): clipped to it, pointing at the target, optionally with a countdown arc. Drawn in world space, so every
 * size is divided by the camera zoom.
 */
export function drawEdgeArrow(
  g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle, zoom: number, tx: number, ty: number,
  color: number, countdown: number | null,
): boolean {
  const m = 0;
  const cx = view.centerX, cy = view.centerY;
  const hx = view.width / 2 - m, hy = view.height / 2 - m;
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) <= hx + m * 0.5 && Math.abs(dy) <= hy + m * 0.5) return false; // on screen
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const k = Math.min(hx / Math.max(Math.abs(dx), 1e-6), hy / Math.max(Math.abs(dy), 1e-6));
  const px = cx + dx * k, py = cy + dy * k;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const s = 1 / zoom;
  const dark = col(C.outline);
  const tri = (grow: number, c: number, a: number): void => {
    g.fillStyle(c, a);
    g.fillTriangle(
      px + ux * (14 + grow) * s, py + uy * (14 + grow) * s,
      px - ux * (8 + grow) * s + nx * (11 + grow) * s, py - uy * (8 + grow) * s + ny * (11 + grow) * s,
      px - ux * (8 + grow) * s - nx * (11 + grow) * s, py - uy * (8 + grow) * s - ny * (11 + grow) * s,
    );
  };
  tri(3, dark, 1);
  tri(0, color, 1);
  if (countdown !== null) {
    const r = 22 * s;
    g.lineStyle(5 * s, dark, 1).beginPath().arc(px, py, r, 0, Math.PI * 2, false).strokePath();
    g.lineStyle(3 * s, color, 1).beginPath().arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, countdown)), false).strokePath();
  }
  return true;
}
