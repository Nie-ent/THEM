/**
 * The in-stage renderer. Reads the sim through `view()` only and never mutates it.
 *
 * - Fixed-step sim, variable-rate render: positions are interpolated between the previous and the
 *   current step with `session.alpha`.
 * - Every silhouette (readability §4) is baked once into a texture with its 2 px outline; entities
 *   are pooled Images indexed by entity id (re-skinned when the slot's uid changes). No per-frame
 *   allocation for entities.
 * - One Graphics layer under units (grid, telegraphs) and one above (HP bars, aim lines), redrawn
 *   each frame; both only draw a handful of primitives.
 * - Camera: desktop keeps the hero centred; portrait phones keep the hero 38% from the top and show
 *   ~17 tiles across (readability §2, §9).
 *
 * Placeholder art only; P1-09 replaces shapes/VFX via this file and shapes.ts.
 */
import Phaser from 'phaser';
import { content, type RenderHint } from '@them/content';
import { Flag, Kind, PickupType, cellAt, view, type RunView } from '@them/core';
import { hexToInt, tokens } from '@them/ui-tokens';
import type { GameSession } from './session';
import { SHAPES } from './shapes';

const C = tokens.color.stage;
const col = (hex: string) => hexToInt(hex);
const TILE = 40;
const OUTLINE = 2;

/** Draw order (readability §1): ground, grid, telegraphs, structures + Core, pickups, enemies, allies, hero, projectiles. */
const DEPTH = { ground: 0, under: 1, structure: 2, pickup: 3, enemy: 4, ally: 5, hero: 6, projectile: 7, over: 8 } as const;

interface Skin { key: string; depth: number; rotate: boolean }

export class StageScene extends Phaser.Scene {
  private session!: GameSession;
  private pool: (Phaser.GameObjects.Image | undefined)[] = [];
  private poolUid = new Uint32Array(0);
  private flashT = new Float32Array(0);
  private skins = new Map<string, Skin>();
  private under!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private camX = 0;
  private camY = 0;
  private offBridge: (() => void)[] = [];

  constructor() {
    super('stage');
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
  }

  create(): void {
    this.bakeTextures();
    const v = view(this.session.run);
    this.cameras.main.setBackgroundColor(C.ground);
    // Ground: arena rectangle with a subtle alternate tone so the edge reads.
    const ground = this.add.graphics().setDepth(DEPTH.ground);
    ground.fillStyle(col(C.groundAlt), 1).fillRect(-400, -400, v.arena.width + 800, v.arena.height + 800);
    ground.fillStyle(col(C.ground), 1).fillRect(0, 0, v.arena.width, v.arena.height);
    this.under = this.add.graphics().setDepth(DEPTH.under);
    this.over = this.add.graphics().setDepth(DEPTH.over);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    kb.on('keydown-SPACE', () => { if (this.session.run.phase === 'prep') this.session.command({ callWave: true }); });
    kb.on('keydown-ESC', () => this.session.command({ pause: true }));
    kb.on('keydown-P', () => this.session.command({ pause: true }));
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.mouse?.disableContextMenu();

    // Hit flash (2 frames white) from sim events.
    this.offBridge.push(this.session.bridge.on('hit', (ev) => { if (ev.e < this.flashT.length) this.flashT[ev.e] = 0.066; }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offBridge.forEach((f) => f()));

    const hero = v.entities;
    this.camX = hero.x[v.hero]!;
    this.camY = hero.y[v.hero]!;
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.updateCamera(0, true));
    this.updateCamera(0, true);
  }

  /* ---------------------------------------------------------------------------------------- */

  private bakeShape(key: string, hint: RenderHint, r: number, fill: number, rim?: number): void {
    if (this.textures.exists(key)) return;
    const shape = SHAPES[hint.shape];
    const size = Math.ceil((r * 1.5 + OUTLINE + 2) * 2);
    const c = size / 2;
    const g = this.make.graphics({}, false);
    const poly = (scale: number, color: number) => {
      g.fillStyle(color, 1);
      if (shape === 'circle') g.fillCircle(c, c, r * scale);
      else g.fillPoints(shape.map(([x, y]) => new Phaser.Math.Vector2(c + x * r * scale, c + y * r * scale)), true);
    };
    const outline = (r + OUTLINE) / r;
    if (hint.shape === 'ring-dashed') {
      g.lineStyle(2, fill, 0.9).strokeCircle(c, c, r - 2);
      g.fillStyle(fill, 0.3).fillCircle(c, c, r - 2);
    } else {
      poly(outline, col(C.outline));
      if (rim !== undefined) { poly(1, rim); poly(1 - 3 / r, fill); } else poly(1, fill);
    }
    // Per-role extra cues, all baked so they cost nothing per frame.
    g.lineStyle(1.5, col(C.outline), 0.8);
    switch (hint.shape) {
      case 'triangle-flame': g.fillStyle(col(C.burning), 1).fillCircle(c + r * 1.1, c, r * 0.35); break;
      case 'circle-ticks':
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) g.lineBetween(c + dx * r * 0.5, c + dy * r * 0.5, c + dx * r * 1.25, c + dy * r * 1.25);
        break;
      case 'hexagon': case 'octagon':
        g.lineBetween(c - r * 0.4, c - r * 0.5, c - r * 0.4, c + r * 0.5);
        g.lineBetween(c + r * 0.1, c - r * 0.5, c + r * 0.1, c + r * 0.5);
        break;
      case 'square-planks':
        for (let k = -1; k <= 1; k++) g.lineBetween(c - r, c + k * r * 0.5, c + r, c + k * r * 0.5);
        break;
      case 'square-bricks':
        for (let k = -1; k <= 1; k++) g.lineBetween(c - r, c + k * r * 0.5, c + r, c + k * r * 0.5);
        g.lineBetween(c, c - r, c, c - r * 0.5); g.lineBetween(c - r * 0.5, c - r * 0.5, c - r * 0.5, c);
        g.lineBetween(c + r * 0.5, c - r * 0.5, c + r * 0.5, c); g.lineBetween(c, c, c, c + r * 0.5);
        break;
      case 'square-tower': g.fillStyle(col(C.outline), 0.5).fillCircle(c, c, r * 0.45); break;
      default: break;
    }
    if (hint.marks.includes('crown')) {
      g.fillStyle(col(C.enemy), 1);
      for (const dx of [-0.5, 0, 0.5]) g.fillTriangle(c + dx * r - r * 0.15, c - r * 1.0, c + dx * r + r * 0.15, c - r * 1.0, c + dx * r, c - r * 1.4);
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private bakeTextures(): void {
    const s = this.skins;
    content.enemies.forEach((d, i) => {
      const elite = d.tier !== 'normal';
      const r = d.radius;
      this.bakeShape(`enemy-${i}`, d.render, r, col(elite ? C.enemyElite : C.enemy), elite ? col(C.enemy) : undefined);
      s.set(`${Kind.Enemy}:${i}`, { key: `enemy-${i}`, depth: DEPTH.enemy, rotate: true });
    });
    content.buildings.forEach((d, i) => {
      const fill = d.render.shape === 'ring-dashed' ? col(C.burning) : col(d.material === 'wood' ? C.structureWood : C.structureStone);
      this.bakeShape(`building-${i}`, d.render, 18, fill);
      s.set(`${Kind.Structure}:${i}`, { key: `building-${i}`, depth: DEPTH.structure, rotate: false });
    });
    content.heroes.forEach((d, i) => {
      this.bakeShape(`ally-${i}`, d.render, d.radius, col(C.ally));
      s.set(`${Kind.Ally}:${i}`, { key: `ally-${i}`, depth: DEPTH.ally, rotate: false });
    });
    const ph = content.balance.playerHero;
    this.bakeShape('hero', { shape: 'circle', scale: 1, marks: [] }, ph.radius, col(C.hero));
    s.set(`${Kind.Hero}:0`, { key: 'hero', depth: DEPTH.hero, rotate: false });
    this.bakeShape('core', { shape: 'diamond', scale: 1, marks: [] }, content.worlds[0]!.core.radius * 0.8, col(C.core));
    s.set(`${Kind.Core}:0`, { key: 'core', depth: DEPTH.structure, rotate: false });
    this.bakeShape('proj-ally', { shape: 'circle', scale: 1, marks: [] }, 4, col(C.allyProjectile));
    this.bakeShape('proj-enemy', { shape: 'circle', scale: 1, marks: [] }, 4, col(C.enemyProjectile));
    this.bakeShape('pickup-xp', { shape: 'diamond', scale: 1, marks: [] }, 4, col(C.xpOrb));
    this.bakeShape('pickup-wood', { shape: 'square', scale: 1, marks: [] }, 4, col(C.pickupWood));
    this.bakeShape('pickup-stone', { shape: 'triangle', scale: 1, marks: [] }, 4, col(C.pickupStone));
  }

  private skinFor(v: RunView, i: number): Skin {
    const e = v.entities;
    const k = e.kind[i]!;
    if (k === Kind.Projectile) return { key: e.team[i] === 0 ? 'proj-ally' : 'proj-enemy', depth: DEPTH.projectile, rotate: false };
    if (k === Kind.Pickup) {
      const t = e.def[i];
      return { key: t === PickupType.Xp ? 'pickup-xp' : t === PickupType.Wood ? 'pickup-wood' : 'pickup-stone', depth: DEPTH.pickup, rotate: false };
    }
    const def = k === Kind.Hero || k === Kind.Core ? 0 : e.def[i]!;
    return this.skins.get(`${k}:${def}`) ?? { key: 'hero', depth: DEPTH.enemy, rotate: false };
  }

  /* ---------------------------------------------------------------------------------------- */

  private onPointer(p: Phaser.Input.Pointer): void {
    const s = this.session;
    const run = s.run;
    if (p.wasTouch && p.y > this.scale.height * 0.55 && s.hud.get().selectedBuilding === null) return; // joystick zone
    if (run.phase !== 'prep' || run.paused) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const cell = cellAt(run.grid, wp.x, wp.y);
    if (cell < 0) return;
    if (p.rightButtonDown()) {
      if (run.grid.cell[cell] !== -1) s.command({ sell: cell });
      return;
    }
    const sel = s.hud.get().selectedBuilding;
    if (sel && run.grid.cell[cell] === -1) s.command({ build: { buildingId: sel, cell } });
  }

  private readKeyboard(): void {
    const k = this.keys;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    this.session.input.keyX = x;
    this.session.input.keyY = y;
  }

  private updateCamera(dt: number, snap = false): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    const portrait = height > width;
    // Desktop: ~32 tiles across at 1280 (zoom 1). Portrait: ~17 tiles across.
    const zoom = portrait ? width / (17 * TILE) : Math.max(0.5, Math.min(1.5, height / 720));
    cam.setZoom(zoom);
    const v = view(this.session.run);
    const e = v.entities;
    const a = this.session.alpha;
    const hx = e.prevX[v.hero]! + (e.x[v.hero]! - e.prevX[v.hero]!) * a;
    const hy = e.prevY[v.hero]! + (e.y[v.hero]! - e.prevY[v.hero]!) * a;
    // Hero at 38% from top in portrait → camera centre sits below the hero.
    const offsetY = portrait ? ((0.5 - 0.38) * height) / zoom : 0;
    const tx = hx, ty = hy + offsetY;
    const k = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    cam.centerOn(this.camX, this.camY);
  }

  override update(_time: number, delta: number): void {
    this.readKeyboard();
    this.session.advance(delta);
    const v = view(this.session.run);
    this.drawEntities(v, delta / 1000);
    this.drawUnder(v);
    this.drawOver(v);
    this.updateCamera(delta / 1000);
  }

  private ensurePool(n: number): void {
    if (this.poolUid.length >= n) return;
    const uid = new Uint32Array(Math.max(n, this.poolUid.length * 2, 256));
    uid.set(this.poolUid);
    this.poolUid = uid;
    const fl = new Float32Array(uid.length);
    fl.set(this.flashT);
    this.flashT = fl;
  }

  private drawEntities(v: RunView, dt: number): void {
    const e = v.entities;
    const a = this.session.alpha;
    this.ensurePool(e.count);
    for (let i = 0; i < e.count; i++) {
      let img = this.pool[i];
      const k = e.kind[i]!;
      if (k === Kind.None || (k === Kind.Ally && (e.flags[i]! & Flag.Down))) {
        if (img?.visible) img.setVisible(false);
        continue;
      }
      if (!img) {
        img = this.add.image(0, 0, 'hero');
        this.pool[i] = img;
        this.poolUid[i] = 0;
      }
      const skin = this.skinFor(v, i);
      if (this.poolUid[i] !== e.uid[i]) {
        this.poolUid[i] = e.uid[i]!;
        img.setTexture(skin.key).setDepth(skin.depth).setVisible(true).setRotation(0).clearTint();
        this.flashT[i] = 0;
      } else if (!img.visible) img.setVisible(true);
      img.setPosition(e.prevX[i]! + (e.x[i]! - e.prevX[i]!) * a, e.prevY[i]! + (e.y[i]! - e.prevY[i]!) * a);
      if (skin.rotate) img.setRotation(Math.atan2(e.faceY[i]!, e.faceX[i]!));
      if (this.flashT[i]! > 0) {
        this.flashT[i]! -= dt;
        img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        if (this.flashT[i]! <= 0) img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    }
    for (let i = e.count; i < this.pool.length; i++) { const img = this.pool[i]; if (img?.visible) img.setVisible(false); }
  }

  private drawUnder(v: RunView): void {
    const g = this.under;
    g.clear();
    const grid = v.grid;
    // Build grid during prep.
    if (v.phase === 'prep') {
      const sel = this.session.hud.get().selectedBuilding;
      g.lineStyle(1, col(C.grid), 1);
      for (let c = 0; c < grid.cell.length; c++) {
        if (!grid.buildable[c]) continue;
        const x = grid.originX + (c % grid.cols) * grid.cellSize, y = grid.originY + Math.floor(c / grid.cols) * grid.cellSize;
        g.strokeRect(x + 1, y + 1, grid.cellSize - 2, grid.cellSize - 2);
      }
      if (sel) {
        const p = this.input.activePointer;
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        const cell = cellAt(grid as never, wp.x, wp.y);
        if (cell >= 0) {
          const ok = grid.buildable[cell] === 1 && grid.cell[cell] === -1;
          const x = grid.originX + (cell % grid.cols) * grid.cellSize, y = grid.originY + Math.floor(cell / grid.cols) * grid.cellSize;
          g.lineStyle(2, col(ok ? C.slotFree : C.slotBlocked), 1).strokeRect(x, y, grid.cellSize, grid.cellSize);
        }
      }
    }
    // Telegraphs: wind-up dashed-ish outline in telegraphWarn (coreThreat if aimed at the Core),
    // commit phase (last 300 ms) solid telegraphImpact. Sweep fill shows time left.
    const commitS = tokens.motion.duration.telegraphCommit / 1000;
    for (const t of v.telegraphs) {
      if (!t.active) continue;
      const commit = t.windup - t.t <= commitS;
      const color = col(t.targetsCore ? C.coreThreat : commit ? C.telegraphImpact : C.telegraphWarn);
      const frac = Math.min(1, t.t / t.windup);
      g.lineStyle(t.targetsCore ? 3 : 2, color, 1);
      g.fillStyle(color, commit ? 0.45 : 0.2);
      if (t.shape === 'circle' || t.shape === 'ring') {
        g.strokeCircle(t.x, t.y, t.r);
        g.fillCircle(t.x, t.y, t.r * frac);
        if (t.shape === 'ring') g.strokeCircle(t.x, t.y, t.r2);
      } else if (t.shape === 'rect') {
        const nx = -t.dy, ny = t.dx, w = t.r2;
        const pts = (len: number) => [
          new Phaser.Math.Vector2(t.x + nx * w, t.y + ny * w), new Phaser.Math.Vector2(t.x + t.dx * len + nx * w, t.y + t.dy * len + ny * w),
          new Phaser.Math.Vector2(t.x + t.dx * len - nx * w, t.y + t.dy * len - ny * w), new Phaser.Math.Vector2(t.x - nx * w, t.y - ny * w),
        ];
        g.strokePoints(pts(t.r), true, true);
        g.fillPoints(pts(t.r * frac), true, true);
      } else {
        g.strokeCircle(t.x, t.y, t.r);
      }
    }
    // Core ring pulses violet while a Core-targeted attack winds up.
    if (v.telegraphs.some((t) => t.active && t.targetsCore)) {
      const e = v.entities;
      g.lineStyle(3, col(C.coreThreat), 0.5 + 0.5 * Math.sin(this.time.now / 80)).strokeCircle(e.x[v.core]!, e.y[v.core]!, e.radius[v.core]! + 10);
    }
  }

  private drawOver(v: RunView): void {
    const g = this.over;
    g.clear();
    const e = v.entities;
    const a = this.session.alpha;
    // Hero ring (readability §4): vellum ring with a gap.
    const hx = e.prevX[v.hero]! + (e.x[v.hero]! - e.prevX[v.hero]!) * a;
    const hy = e.prevY[v.hero]! + (e.y[v.hero]! - e.prevY[v.hero]!) * a;
    g.lineStyle(3, col(C.hero), 0.9).strokeCircle(hx, hy, e.radius[v.hero]! + 5);
    g.lineStyle(2, col(C.outline), 1).lineBetween(hx, hy, hx + e.faceX[v.hero]! * e.radius[v.hero]!, hy + e.faceY[v.hero]! * e.radius[v.hero]!);
    // HP bars: Core, structures, allies, elites/bosses only (horde stays clean).
    let aimLines = 0;
    for (let i = 0; i < e.count; i++) {
      const k = e.kind[i];
      if (k === Kind.Enemy) {
        if (e.aim[i]! > 0 && aimLines < 12) {
          const t = e.target[i]!;
          if (t >= 0) { g.lineStyle(1, col(C.telegraphWarn), 0.5).lineBetween(e.x[i]!, e.y[i]!, e.x[t]!, e.y[t]!); aimLines++; }
        }
        if (!(e.flags[i]! & Flag.Boss)) continue;
      } else if (k !== Kind.Core && k !== Kind.Structure && k !== Kind.Ally) continue;
      if (k === Kind.Ally && (e.flags[i]! & Flag.Down)) continue;
      const frac = Math.max(0, e.hp[i]! / e.maxHp[i]!);
      if (frac >= 1 && k !== Kind.Core) {
        if (k === Kind.Structure && e.burn[i]! > 0) this.drawFlames(g, e.x[i]!, e.y[i]! - e.radius[i]!);
        continue;
      }
      const w = Math.max(28, e.radius[i]! * 2), x = e.x[i]! - w / 2, y = e.y[i]! - e.radius[i]! - 10;
      g.fillStyle(col(tokens.color.hud.track), 1).fillRect(x, y, w, 4);
      g.fillStyle(col(k === Kind.Enemy ? C.enemy : k === Kind.Core ? tokens.color.hud.hpCore : C.heal), 1).fillRect(x, y, w * frac, 4);
      if (k === Kind.Structure && e.burn[i]! > 0) this.drawFlames(g, e.x[i]!, e.y[i]! - e.radius[i]!);
    }
  }

  private drawFlames(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const flick = Math.floor(this.time.now / 166) % 2 === 0 ? 1 : 0.7;
    g.fillStyle(col(C.burning), 1);
    for (const dx of [-10, 0, 10]) g.fillTriangle(x + dx - 4, y, x + dx + 4, y, x + dx, y - 10 * flick);
  }
}
