/**
 * The in-stage renderer. Reads the sim through `view()` only and never mutates it.
 *
 * - Fixed-step sim, variable-rate render: positions are interpolated between the previous and the
 *   current step with `session.alpha`.
 * - Silhouettes (readability §4) are baked once by `art.ts` into textures with their outline;
 *   entities are pooled Images indexed by entity id (re-skinned when the slot's uid changes).
 * - Ground-plane layer (`under`): grid, telegraphs (`telegraphs.ts`), impact flashes, charred slots.
 *   Overlay layer (`over`): flames, HP bars, auras, aim lines, hero ring. Edge layer: Core-threat arrow
 *   and spawn chevrons. Damage numbers are pooled BitmapText (`fx.ts`, max 24).
 * - Settings (damage numbers, screen shake, outline weight) are read from `ui/settings.ts` live.
 * - Camera: desktop keeps the hero centred; portrait phones keep the hero 38% from the top and show
 *   ~17 tiles across (readability §2, §9).
 */
import Phaser from 'phaser';
import { content } from '@them/content';
import { Flag, Kind, cellAt, intel, view, type RunView } from '@them/core';
import type { Side } from '@them/content';
import { hexToInt, tokens } from '@them/ui-tokens';
import { getSettings } from '../ui/settings';
import { DEPTH, bakeSkins, col, type Skin, type SkinSet } from './art';
import { DamageNumbers, Sparks, drawEdgeArrow } from './fx';
import type { GameSession } from './session';
import { copyShape, drawImpact, drawTelegraph, type TeleShape } from './telegraphs';

const C = tokens.color.stage;
const TILE = 40;
/**
 * Hit flash fill (readability §7: "2-frame white hit flash"). ui-tokens has no dedicated flash
 * token yet; the brightest stage white is `damageNormal` (vellum-100).
 */
const HIT_FLASH = hexToInt(C.damageNormal);
/** 30% darker multiply tint for structures burning below 50% HP (readability §6 stage 2). */
const DARKEN = Phaser.Display.Color.GetColor(179, 179, 179);
const SIDE_POS: Record<Side, { fx: number; fy: number; dx: number; dy: number }> = {
  N: { fx: 0.5, fy: 0, dx: 0, dy: 1 }, E: { fx: 1, fy: 0.5, dx: -1, dy: 0 },
  S: { fx: 0.5, fy: 1, dx: 0, dy: -1 }, W: { fx: 0, fy: 0.5, dx: 1, dy: 0 },
};
const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const MAX_AIM = 12;
const FLASH_POOL = 16;
const CHARRED_MAX = 40;

interface ImpactFlash { shape: TeleShape; t: number }

export class StageScene extends Phaser.Scene {
  private session!: GameSession;
  private skins!: SkinSet;
  private outlineW = 2;
  private pool: (Phaser.GameObjects.Image | undefined)[] = [];
  private poolUid = new Uint32Array(0);
  private flashT = new Float32Array(0);
  /** 1 while a structure image carries the burning-darken tint. */
  private dark = new Uint8Array(0);
  /** 1 once a structure has been seen burning (so its death leaves a charred slot). */
  private wasBurning = new Uint8Array(0);
  private under!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private edge!: Phaser.GameObjects.Graphics;
  private numbers!: DamageNumbers;
  private sparks = new Sparks();
  private sparkG!: Phaser.GameObjects.Graphics;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private camX = 0;
  private camY = 0;
  private offBridge: (() => void)[] = [];

  private safe = new Phaser.Geom.Rectangle();
  private teleCache = new Map<number, TeleShape>();
  private flashes: ImpactFlash[] = [];
  private charred: { x: number; y: number }[] = [];
  private chevrons: { side: Side; t: number }[] = [];
  private heroHitT = 0;
  private enemyCount = 0;
  private aimIdx = new Int32Array(MAX_AIM);
  private aimD = new Float64Array(MAX_AIM);
  private drumDef = new Uint8Array(0);
  private tierOf: string[] = [];
  private starsOf: number[] = [];
  private towerRange: number[] = [];

  constructor() {
    super('stage');
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
  }

  create(): void {
    this.outlineW = getSettings().outline === 'thick' ? 3 : 2;
    this.skins = bakeSkins(this, this.outlineW);
    this.tierOf = content.enemies.map((d) => d.tier);
    this.drumDef = Uint8Array.from(content.enemies.map((d) => (d.behaviors.some((b) => b.id === 'drum-buff') ? 1 : 0)));
    this.starsOf = content.heroes.map((h) => h.stars);
    this.towerRange = content.buildings.map((b) => (b.behavior === 'tower' ? Number(b.params.range ?? 0) : 0));
    for (let i = 0; i < FLASH_POOL; i++) {
      this.flashes.push({ shape: { shape: 'circle', x: 0, y: 0, r: 0, r2: 0, dx: 1, dy: 0, core: false }, t: -1 });
    }
    const v = view(this.session.run);
    this.cameras.main.setBackgroundColor(C.ground);
    // Ground: arena rectangle with a subtle alternate tone so the edge reads.
    const ground = this.add.graphics().setDepth(DEPTH.ground);
    ground.fillStyle(col(C.groundAlt), 1).fillRect(-400, -400, v.arena.width + 800, v.arena.height + 800);
    ground.fillStyle(col(C.ground), 1).fillRect(0, 0, v.arena.width, v.arena.height);
    this.under = this.add.graphics().setDepth(DEPTH.under);
    this.over = this.add.graphics().setDepth(DEPTH.over);
    this.sparkG = this.add.graphics().setDepth(DEPTH.numbers - 0.5);
    this.numbers = new DamageNumbers(this, DEPTH.numbers);
    this.edge = this.add.graphics().setDepth(DEPTH.edge);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    kb.on('keydown-SPACE', () => { if (this.session.run.phase === 'prep') this.session.command({ callWave: true }); });
    kb.on('keydown-ESC', () => this.session.command({ pause: true }));
    kb.on('keydown-P', () => this.session.command({ pause: true }));
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    this.session.screenToWorld = (x, y) => {
      const w = this.cameras.main.getWorldPoint(x, y);
      return { x: w.x, y: w.y };
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.session.screenToWorld = null; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.mouse?.disableContextMenu();

    this.listen();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offBridge.forEach((f) => f()));

    const hero = v.entities;
    this.camX = hero.x[v.hero]!;
    this.camY = hero.y[v.hero]!;
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.updateCamera(0, true));
    this.updateCamera(0, true);
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Sim events → VFX                                                                         */
  /* ---------------------------------------------------------------------------------------- */

  private get reduced(): boolean {
    return document.documentElement.dataset.motion === 'reduce';
  }

  private shake(ms: number, amount: number): void {
    if (getSettings().screenShake && !this.reduced) this.cameras.main.shake(ms, amount);
  }

  /** 0 = nothing shed; 1 hit sparks; 2 + damage numbers except damage taken; 3 + drummer aura 8%. */
  private get shed(): number {
    const portrait = this.scale.height > this.scale.width;
    const thr = portrait || this.scale.width < 600 ? 250 : 400;
    const n = this.enemyCount;
    return n > thr * 1.3 ? 3 : n > thr * 1.15 ? 2 : n > thr ? 1 : 0;
  }

  private listen(): void {
    const b = this.session.bridge;
    this.offBridge.push(
      b.on('hit', (ev) => {
        const run = this.session.run;
        const w = run.w;
        const mode = getSettings().damageNumbers;
        if (ev.kind === Kind.Hero) {
          this.heroHitT = 0.2;
          this.shake(90, 0.004);
          if (mode !== 'off' && ev.amount >= 1) this.numbers.add(ev.uid, ev.x, ev.y - w.radius[ev.e]! - 6, ev.amount, 'taken');
          if (ev.e < this.flashT.length) this.flashT[ev.e] = 0.066;
          return;
        }
        if (ev.e < this.flashT.length && ev.kind !== Kind.Structure && ev.kind !== Kind.Core) this.flashT[ev.e] = 0.066;
        if (ev.kind !== Kind.Enemy) return;
        const shed = this.shed;
        if (shed < 1) this.sparks.add(ev.x, ev.y);
        if (ev.source !== run.hero || mode === 'off' || shed >= 2) return;
        const important = ev.crit || this.tierOf[w.def[ev.e]!] !== 'normal';
        if (mode === 'all' || important) this.numbers.add(ev.uid, ev.x, ev.y - w.radius[ev.e]! - 6, ev.amount, ev.crit ? 'crit' : 'normal');
      }),
      b.on('burn', (ev) => {
        // Stone shows a one-frame spark only, to teach the rule (readability §6).
        if (ev.state === 'resist' && ev.kind === Kind.Structure) this.sparks.add(this.session.run.w.x[ev.e]!, this.session.run.w.y[ev.e]!, true);
      }),
      b.on('death', (ev) => {
        if (ev.kind === Kind.Structure && this.wasBurning[ev.e] && this.charred.length < CHARRED_MAX) this.charred.push({ x: ev.x, y: ev.y });
        if (ev.e < this.wasBurning.length) this.wasBurning[ev.e] = 0;
      }),
      b.on('telegraph', (ev) => {
        if (ev.state !== 'impact') return;
        const s = this.teleCache.get(ev.id);
        if (!s) return;
        const f = this.flashes.find((x) => x.t < 0) ?? this.flashes[0]!;
        Object.assign(f.shape, s);
        f.t = 0;
        this.teleCache.delete(ev.id);
        this.shake(120, 0.003);
      }),
      b.on('waveStart', (ev) => {
        const i = intel(this.session.run, ev.wave);
        this.chevrons.length = 0;
        if (i) for (const side of SIDES) if (i.sides[side] > 0) this.chevrons.push({ side, t: 0 });
      }),
      b.on('waveEnd', () => { this.charred.length = 0; }),
    );
  }

  /* ---------------------------------------------------------------------------------------- */

  private skinFor(v: RunView, i: number): Skin {
    const e = v.entities;
    const s = this.skins;
    const k = e.kind[i]!;
    if (k === Kind.Projectile) return e.team[i] === 0 ? s.projAlly : s.projEnemy;
    if (k === Kind.Pickup) return s.pickup[e.def[i]!] ?? s.pickup[0]!;
    if (k === Kind.Hero) return s.hero;
    if (k === Kind.Core) return s.core;
    if (k === Kind.Enemy) return s.enemy[e.def[i]!] ?? s.fallback;
    if (k === Kind.Structure) return s.structure[e.def[i]!] ?? s.fallback;
    if (k === Kind.Ally) return s.ally[e.def[i]!] ?? s.fallback;
    return s.fallback;
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    const s = this.session;
    const run = s.run;
    if (p.rightButtonDown() && s.hud.get().selectedBuilding !== null) { s.selectBuilding(null); return; }
    if (s.tapAt(p.x, p.y)) return; // a React screen (mobile build, hero placement) owns this tap
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
    // Prep frames the Core and build grid (prep.md); during waves the camera follows the hero.
    const focus = v.phase === 'prep' ? v.core : v.hero;
    const hx = e.prevX[focus]! + (e.x[focus]! - e.prevX[focus]!) * a;
    const hy = e.prevY[focus]! + (e.y[focus]! - e.prevY[focus]!) * a;
    // Portrait: hero at 38% from top (thumb room). In prep the Core sits at 55%, centred between
    // the intel strip above and the build sheet below.
    const offsetY = portrait ? ((0.5 - (v.phase === 'prep' ? 0.55 : 0.38)) * height) / zoom : 0;
    const tx = hx, ty = hy + offsetY;
    const k = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    cam.centerOn(this.camX, this.camY);
  }

  override update(_time: number, delta: number): void {
    this.readKeyboard();
    this.session.advance(delta);
    const ow = getSettings().outline === 'thick' ? 3 : 2;
    if (ow !== this.outlineW) {
      this.outlineW = ow;
      this.skins = bakeSkins(this, ow);
      this.poolUid.fill(0); // re-skin every pooled image on this frame
    }
    const dt = delta / 1000;
    const v = view(this.session.run);
    this.drawEntities(v, dt);
    this.drawUnder(v, dt);
    this.drawOver(v, dt);
    this.drawEdge(v, dt);
    this.sparkG.clear();
    if (this.shed < 1) this.sparks.draw(this.sparkG, dt);
    if (this.shed >= 2) this.numbers.shedNonTaken();
    this.numbers.update(dt, !this.reduced);
    this.updateCamera(dt);
  }

  private ensurePool(n: number): void {
    if (this.poolUid.length >= n) return;
    const len = Math.max(n, this.poolUid.length * 2, 256);
    const grow = <T extends Uint8Array | Uint32Array | Float32Array>(old: T): T => {
      const a = new (old.constructor as new (n: number) => T)(len);
      a.set(old);
      return a;
    };
    this.poolUid = grow(this.poolUid);
    this.flashT = grow(this.flashT);
    this.dark = grow(this.dark);
    this.wasBurning = grow(this.wasBurning);
  }

  private drawEntities(v: RunView, dt: number): void {
    const e = v.entities;
    const a = this.session.alpha;
    this.ensurePool(e.count);
    const flickerB = Math.floor(this.time.now / 125) % 2 === 1; // 4 Hz two-frame swap (torch-bearer flame)
    let enemies = 0;
    for (let i = 0; i < e.count; i++) {
      let img = this.pool[i];
      const k = e.kind[i]!;
      if (k === Kind.None || (k === Kind.Ally && (e.flags[i]! & Flag.Down))) {
        if (img?.visible) img.setVisible(false);
        continue;
      }
      if (k === Kind.Enemy) enemies++;
      if (!img) {
        img = this.add.image(0, 0, this.skins.hero.key);
        this.pool[i] = img;
        this.poolUid[i] = 0;
      }
      const skin = this.skinFor(v, i);
      if (this.poolUid[i] !== e.uid[i]) {
        this.poolUid[i] = e.uid[i]!;
        img.setTexture(skin.key).setDepth(skin.depth).setVisible(true).setRotation(0).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        this.flashT[i] = 0;
        this.dark[i] = 0;
        this.wasBurning[i] = 0;
      } else if (!img.visible) img.setVisible(true);
      if (skin.altKey) {
        const want = flickerB ? skin.altKey : skin.key;
        if (img.texture.key !== want) img.setTexture(want);
      }
      img.setPosition(e.prevX[i]! + (e.x[i]! - e.prevX[i]!) * a, e.prevY[i]! + (e.y[i]! - e.prevY[i]!) * a);
      if (skin.rotate) img.setRotation(Math.atan2(e.faceY[i]!, e.faceX[i]!));
      if (this.flashT[i]! > 0) {
        this.flashT[i]! -= dt;
        img.setTint(HIT_FLASH).setTintMode(Phaser.TintModes.FILL);
        if (this.flashT[i]! <= 0) { img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); this.dark[i] = 0; }
      } else if (k === Kind.Structure) {
        // Burning below 50% HP: structure fill darkens 30% (readability §6 stage 2).
        const want = e.burn[i]! > 0 && e.hp[i]! < e.maxHp[i]! * 0.5 ? 1 : 0;
        if (want !== this.dark[i]) {
          this.dark[i] = want;
          if (want) img.setTint(DARKEN); else img.clearTint();
        }
      }
    }
    this.enemyCount = enemies;
    for (let i = e.count; i < this.pool.length; i++) { const img = this.pool[i]; if (img?.visible) img.setVisible(false); }
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Ground plane                                                                             */
  /* ---------------------------------------------------------------------------------------- */

  private drawUnder(v: RunView, dt: number): void {
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
    // Placement ghost from the React build flow: dashed outline when valid, solid + cross when blocked.
    const ghost = this.session.ghost;
    if (ghost && v.phase === 'prep' && ghost.cell >= 0) {
      const gx = grid.originX + (ghost.cell % grid.cols) * grid.cellSize, gy = grid.originY + Math.floor(ghost.cell / grid.cols) * grid.cellSize;
      const gc = col(ghost.ok ? C.slotFree : C.slotBlocked);
      g.fillStyle(gc, 0.25).fillRect(gx, gy, grid.cellSize, grid.cellSize);
      g.lineStyle(2, gc, 1);
      if (ghost.ok) this.dashedRect(g, gx, gy, grid.cellSize, grid.cellSize);
      else {
        g.strokeRect(gx, gy, grid.cellSize, grid.cellSize);
        g.lineBetween(gx + 8, gy + 8, gx + grid.cellSize - 8, gy + grid.cellSize - 8);
        g.lineBetween(gx + grid.cellSize - 8, gy + 8, gx + 8, gy + 8 + grid.cellSize - 16);
      }
    }
    // Burnt-out wood leaves a charred outline for the rest of the wave (readability §6).
    if (this.charred.length) {
      g.lineStyle(2, col(C.slotBlocked), 1);
      for (const c of this.charred) g.strokeRect(c.x - TILE / 2 + 2, c.y - TILE / 2 + 2, TILE - 4, TILE - 4);
    }
    // Archer tower range rings during prep.
    if (v.phase === 'prep') {
      const e = v.entities;
      g.lineStyle(1, col(C.slotFree), 0.3);
      for (let i = 0; i < e.count; i++) {
        if (e.kind[i] !== Kind.Structure) continue;
        const r = this.towerRange[e.def[i]!] ?? 0;
        if (r > 0) g.strokeCircle(e.x[i]!, e.y[i]!, r);
      }
    }
    // War-drummer beat: an expanding outline ring (radius 0 to 120) on the ground plane, under units
    // (readability §4). Never a filled disc, so it cannot be mistaken for a telegraph fill.
    {
      const e = v.entities;
      const beat = (this.time.now % 1000) / 1000;
      const alpha = (this.shed >= 3 ? 0.08 : 0.15) * 2 * (1 - beat);
      g.lineStyle(2, col(C.enemy), alpha);
      for (let i = 0; i < e.count; i++) {
        if (e.kind[i] === Kind.Enemy && this.drumDef[e.def[i]!]) g.strokeCircle(e.x[i]!, e.y[i]!, 120 * beat);
      }
    }
    // Telegraphs (ground plane, under units). Cache the shape so the impact flash can reuse it.
    let coreThreat = false;
    for (const t of v.telegraphs) {
      if (!t.active) continue;
      let s = this.teleCache.get(t.id);
      s = copyShape(t, s);
      this.teleCache.set(t.id, s);
      drawTelegraph(g, t, s);
      if (t.targetsCore) coreThreat = true;
    }
    for (const f of this.flashes) {
      if (f.t < 0) continue;
      f.t += dt;
      if (f.t > 0.034 + 0.15) { f.t = -1; continue; }
      drawImpact(g, f.shape, f.t < 0.034, 1 - Math.max(0, f.t - 0.034) / 0.15);
    }
    // Core pulses a violet ring at 2 Hz for the whole wind-up (readability §5).
    if (coreThreat) {
      const e = v.entities;
      const pulse = 0.5 + 0.5 * Math.sin((this.time.now / 1000) * Math.PI * 4);
      g.lineStyle(4, col(C.coreThreat), 0.35 + 0.65 * pulse).strokeCircle(e.x[v.core]!, e.y[v.core]!, e.radius[v.core]! + 12);
    }
  }

  private dashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const dash = 8, gap = 6;
    const edge = (x0: number, y0: number, dx: number, dy: number, len: number) => {
      for (let t = 0; t < len; t += dash + gap) {
        const e = Math.min(t + dash, len);
        g.lineBetween(x0 + dx * t, y0 + dy * t, x0 + dx * e, y0 + dy * e);
      }
    };
    edge(x, y, 1, 0, w); edge(x + w, y, 0, 1, h); edge(x + w, y + h, -1, 0, w); edge(x, y + h, 0, -1, h);
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Overlay                                                                                  */
  /* ---------------------------------------------------------------------------------------- */

  private drawOver(v: RunView, dt: number): void {
    const g = this.over;
    g.clear();
    const e = v.entities;
    const a = this.session.alpha;
    const now = this.time.now;
    const hx = e.prevX[v.hero]! + (e.x[v.hero]! - e.prevX[v.hero]!) * a;
    const hy = e.prevY[v.hero]! + (e.y[v.hero]! - e.prevY[v.hero]!) * a;
    const flick6 = Math.floor(now / 83) % 2; // 6 Hz two-frame flicker
    let aimN = 0;

    for (let i = 0; i < e.count; i++) {
      const k = e.kind[i];
      if (k === Kind.Enemy) {
        const x = e.x[i]!, y = e.y[i]!, r = e.radius[i]!;
        const def = e.def[i]!;
        if (e.flags[i]! & Flag.Fire) this.drawEnemyFlame(g, x, y - r, flick6);
        if (e.aim[i]! > 0 && e.target[i]! >= 0) {
          // Keep only the MAX_AIM aim lines nearest the hero.
          const d = (x - hx) * (x - hx) + (y - hy) * (y - hy);
          let slot = -1;
          if (aimN < MAX_AIM) slot = aimN++;
          else {
            let worst = 0;
            for (let q = 1; q < MAX_AIM; q++) if (this.aimD[q]! > this.aimD[worst]!) worst = q;
            if (d < this.aimD[worst]!) slot = worst;
          }
          if (slot >= 0) { this.aimIdx[slot] = i; this.aimD[slot] = d; }
        }
        const tier = this.tierOf[def];
        if (tier === 'miniboss') this.hpBar(g, x, y - r - 12, 60, e.hp[i]! / e.maxHp[i]!, col(C.enemy));
        continue;
      }
      if (k === Kind.Ally) {
        if (e.flags[i]! & Flag.Down) continue;
        const x = e.x[i]!, y = e.y[i]!, r = e.radius[i]!;
        const stars = this.starsOf[e.def[i]!] ?? 1;
        g.fillStyle(col(C.outline), 1);
        for (let s = 0; s < stars; s++) g.fillCircle(x + (s - (stars - 1) / 2) * 9, y - r - 11, 4.5);
        g.fillStyle(col(C.ally), 1);
        for (let s = 0; s < stars; s++) g.fillCircle(x + (s - (stars - 1) / 2) * 9, y - r - 11, 3);
        const frac = e.hp[i]! / e.maxHp[i]!;
        if (frac < 1) this.hpBar(g, x, y - r - 6, Math.max(28, r * 2), frac, col(C.heal));
        continue;
      }
      if (k === Kind.Core) {
        const x = e.x[i]!, y = e.y[i]!, rr = e.radius[i]! + 7;
        const frac = Math.max(0, e.hp[i]! / e.maxHp[i]!);
        g.lineStyle(5, col(C.outline), 1).strokeCircle(x, y, rr);
        g.lineStyle(3, col(tokens.color.hud.track), 1).strokeCircle(x, y, rr);
        if (frac > 0) {
          g.lineStyle(3, col(tokens.color.hud.hpCore), 1).beginPath()
            .arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false).strokePath();
        }
        continue;
      }
      if (k === Kind.Structure) {
        const x = e.x[i]!, y = e.y[i]!, r = e.radius[i]!;
        const frac = e.hp[i]! / e.maxHp[i]!;
        if (e.burn[i]! > 0) {
          this.wasBurning[i] = 1;
          // Stage 1: three flame tongues on the top edge; stage 2 (below 50%): doubled.
          this.drawFlames(g, x, y - r, flick6, frac < 0.5 ? 2 : 1);
        }
        if (frac < 1) this.hpBar(g, x, y - r - (e.burn[i]! > 0 ? 24 : 8), Math.max(28, r * 2), frac, col(C.heal));
      }
    }

    // Aim lines (400 ms before a ranged shot) plus a hollow ring around the winding-up slinger.
    for (let q = 0; q < aimN; q++) {
      const i = this.aimIdx[q]!;
      const t = e.target[i]!;
      g.lineStyle(1, col(C.telegraphWarn), 0.5).lineBetween(e.x[i]!, e.y[i]!, e.x[t]!, e.y[t]!);
      g.lineStyle(2, col(C.telegraphWarn), 0.9).strokeCircle(e.x[i]!, e.y[i]!, e.radius[i]! + 5);
    }

    // Hero ring on top of everything: vellum, flashes damageTaken when hit; facing wedge.
    const hr = e.radius[v.hero]!;
    if (this.heroHitT > 0) this.heroHitT -= dt;
    g.lineStyle(5, col(C.outline), 1).strokeCircle(hx, hy, hr + 5);
    g.lineStyle(3, col(this.heroHitT > 0 ? C.damageTaken : C.hero), 1).strokeCircle(hx, hy, hr + 5);
    const fx = e.faceX[v.hero]!, fy = e.faceY[v.hero]!;
    g.fillStyle(col(C.outline), 1).fillTriangle(
      hx + fx * (hr + 1), hy + fy * (hr + 1),
      hx + fx * (hr - 8) - fy * 6, hy + fy * (hr - 8) + fx * 6,
      hx + fx * (hr - 8) + fy * 6, hy + fy * (hr - 8) - fx * 6,
    );
  }

  private hpBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, frac: number, color: number): void {
    const x = cx - w / 2;
    g.fillStyle(col(C.outline), 1).fillRect(x - 1, y - 1, w + 2, 6);
    g.fillStyle(col(tokens.color.hud.track), 1).fillRect(x, y, w, 4);
    g.fillStyle(color, 1).fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 4);
  }

  /** One small flame tongue above a burning enemy (engine `burn` state, Flag.Fire). */
  private drawEnemyFlame(g: Phaser.GameObjects.Graphics, x: number, y: number, flick: number): void {
    g.fillStyle(col(C.burning), 1);
    g.fillTriangle(x - 3, y, x + 3, y, x, y - (flick ? 9 : 6));
  }

  /** Flame tongues on a structure's top edge, `stage` 2 doubles them. */
  private drawFlames(g: Phaser.GameObjects.Graphics, x: number, y: number, flick: number, stage: 1 | 2): void {
    const n = stage === 2 ? 6 : 3;
    for (let k = 0; k < n; k++) {
      const dx = (k - (n - 1) / 2) * (stage === 2 ? 7 : 13);
      const h = ((k + flick) % 2 === 0 ? 17 : 11) * (stage === 2 ? 1.25 : 1);
      g.fillStyle(col(C.outline), 1).fillTriangle(x + dx - 7.5, y + 2, x + dx + 7.5, y + 2, x + dx, y - h - 3);
      g.fillStyle(col(C.burning), 1).fillTriangle(x + dx - 5.5, y + 1, x + dx + 5.5, y + 1, x + dx, y - h);
    }
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Edge indicators (never shed)                                                             */
  /* ---------------------------------------------------------------------------------------- */

  /**
   * View rectangle (world units) inset by the HUD: top 150 px desktop / 180 px portrait (+40 px with a
   * boss bar), bottom 24 px desktop / 0 portrait, sides 24 px. Edge indicators clamp inside it.
   */
  private safeRect(): Phaser.Geom.Rectangle {
    const cam = this.cameras.main;
    const portrait = this.scale.height > this.scale.width;
    const top = (portrait ? 180 : 150) + (this.session.hud.get().boss ? 40 : 0);
    const bottom = portrait ? 0 : 24;
    const z = cam.zoom, wv = cam.worldView;
    const r = this.safe;
    r.setTo(wv.x + 24 / z, wv.y + top / z, wv.width - 48 / z, wv.height - (top + bottom) / z);
    return r;
  }

  private drawEdge(v: RunView, dt: number): void {
    const g = this.edge;
    g.clear();
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    const view_ = this.safeRect();
    const e = v.entities;
    // Core-threat arrow with a countdown arc when the Core is off-screen.
    let best: Readonly<(typeof v.telegraphs)[number]> | null = null;
    for (const t of v.telegraphs) if (t.active && t.targetsCore && (!best || t.windup - t.t < best.windup - best.t)) best = t;
    if (best) drawEdgeArrow(g, view_, zoom, e.x[v.core]!, e.y[v.core]!, col(C.coreThreat), Math.max(0, 1 - best.t / best.windup));
    // Spawn-direction chevrons for 2 s at wave start (3 chevrons per side, `enemy`).
    const W = v.arena.width, H = v.arena.height, s = 1 / zoom;
    for (let q = this.chevrons.length - 1; q >= 0; q--) {
      const c = this.chevrons[q]!;
      c.t += dt;
      if (c.t > 2) { this.chevrons.splice(q, 1); continue; }
      const sp = SIDE_POS[c.side];
      const m = 22 * s;
      const px = Phaser.Math.Clamp(sp.fx * W, view_.x + m, view_.right - m);
      const py = Phaser.Math.Clamp(sp.fy * H, view_.y + m, view_.bottom - m);
      const alpha = c.t > 1.6 ? (2 - c.t) / 0.4 : 0.6 + 0.4 * Math.sin(c.t * Math.PI * 6);
      const nx = -sp.dy, ny = sp.dx;
      for (let k = 0; k < 3; k++) {
        const ox = px + sp.dx * k * 14 * s, oy = py + sp.dy * k * 14 * s;
        const tipX = ox + sp.dx * 8 * s, tipY = oy + sp.dy * 8 * s;
        const a1x = ox - sp.dx * 4 * s + nx * 14 * s, a1y = oy - sp.dy * 4 * s + ny * 14 * s;
        const a2x = ox - sp.dx * 4 * s - nx * 14 * s, a2y = oy - sp.dy * 4 * s - ny * 14 * s;
        g.lineStyle(7 * s, col(C.outline), alpha).lineBetween(a1x, a1y, tipX, tipY).lineBetween(tipX, tipY, a2x, a2y);
        g.lineStyle(4 * s, col(C.enemy), alpha).lineBetween(a1x, a1y, tipX, tipY).lineBetween(tipX, tipY, a2x, a2y);
      }
    }
  }
}
