/**
 * Entity storage: a hand-rolled structure-of-arrays ECS.
 *
 * Why not bitECS? bitECS 0.4 stores components as user-supplied arrays and queries return
 * entity lists whose order depends on archetype bookkeeping (add/remove component order). We need
 * (1) a strict, explicit iteration order for determinism (ascending entity index, always),
 * (2) zero allocation per tick, and (3) clean strict-TS types for the renderer's read-only views.
 * A fixed set of typed arrays indexed by entity id, with a `kind` column acting as the archetype
 * tag, gives all three with ~150 lines and no dependency. Systems are plain functions that loop
 * `for (let i = 0; i < w.highWater; i++) if (w.kind[i] === Kind.Enemy) …`.
 *
 * Pooling: released ids go to a pending list and become reusable only after `flushFree()` at the
 * end of the tick (so an id never changes meaning mid-tick, e.g. inside the spatial hash). Reuse is
 * LIFO. `uid` is a monotonically increasing spawn id so the renderer can tell a reused slot from the
 * old entity.
 */
import { CAPACITY, Kind } from './constants';

export class World {
  readonly capacity: number;
  /** One past the highest index ever allocated. Loops run to here, not to capacity. */
  highWater = 0;
  private readonly free: Int32Array;
  private freeTop = 0;
  private readonly pending: Int32Array;
  private pendingTop = 0;
  nextUid = 1;
  aliveCount = 0;

  readonly kind: Uint8Array;
  readonly uid: Uint32Array;
  /** Index into the content array for this kind (enemies[], buildings[], heroes[]), or pickup type. */
  readonly def: Int16Array;
  readonly team: Uint8Array;
  readonly flags: Uint16Array;

  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Position at the start of the last step, for render interpolation. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Facing direction (unit vector). */
  readonly fx: Float64Array;
  readonly fy: Float64Array;
  readonly radius: Float64Array;
  readonly speed: Float64Array;
  readonly hp: Float64Array;
  readonly maxHp: Float64Array;
  readonly armor: Float64Array;

  // weapon
  readonly wDamage: Float64Array;
  readonly wCooldown: Float64Array;
  readonly wRange: Float64Array;
  readonly wProjSpeed: Float64Array;
  readonly wProjRadius: Float64Array;
  readonly wPierce: Uint8Array;
  readonly wCount: Uint8Array;
  readonly wType: Uint8Array;
  /** Seconds until the weapon can fire again. */
  readonly atkT: Float64Array;
  /** Seconds a ranged attacker has been aiming (aim line is visible while > 0). */
  readonly aimT: Float64Array;
  readonly target: Int32Array;
  /** Structure the entity is pressed against this tick (enemies), or -1. */
  readonly blockedBy: Int32Array;

  // projectile / pickup
  /** Projectile: remaining lifetime (s). */
  readonly life: Float64Array;
  /** Projectile: hits left. Pickup: value. */
  readonly value: Float64Array;
  /** Projectile: entity that fired it (for on-hit hooks). */
  readonly owner: Int32Array;
  /** Projectile: last entity hit, so piercing shots do not hit the same target twice in a row. */
  readonly lastHit: Int32Array;

  // status
  readonly burnT: Float64Array;
  /** Damage multiplier from buffs (drummer). Behaviours may raise it; reset to 1 each tick. */
  readonly buff: Float64Array;
  /** Speed multiplier from buffs/slows; reset to 1 each tick. */
  readonly speedBuff: Float64Array;
  /** Wave number (1-based) that spawned the entity. */
  readonly wave: Int16Array;
  /** Free scratch for behaviours (cooldowns, state machines). Hashed for determinism. */
  readonly aux0: Float64Array;
  readonly aux1: Float64Array;
  /** Home position (allies: post set during prep; structures: cell centre). */
  readonly hx: Float64Array;
  readonly hy: Float64Array;

  constructor(capacity = CAPACITY) {
    this.capacity = capacity;
    this.free = new Int32Array(capacity);
    this.pending = new Int32Array(capacity);
    const f64 = () => new Float64Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.uid = new Uint32Array(capacity);
    this.def = new Int16Array(capacity);
    this.team = new Uint8Array(capacity);
    this.flags = new Uint16Array(capacity);
    this.x = f64(); this.y = f64(); this.px = f64(); this.py = f64();
    this.vx = f64(); this.vy = f64(); this.fx = f64(); this.fy = f64();
    this.radius = f64(); this.speed = f64(); this.hp = f64(); this.maxHp = f64(); this.armor = f64();
    this.wDamage = f64(); this.wCooldown = f64(); this.wRange = f64();
    this.wProjSpeed = f64(); this.wProjRadius = f64();
    this.wPierce = new Uint8Array(capacity); this.wCount = new Uint8Array(capacity); this.wType = new Uint8Array(capacity);
    this.atkT = f64(); this.aimT = f64();
    this.target = new Int32Array(capacity).fill(-1);
    this.blockedBy = new Int32Array(capacity).fill(-1);
    this.life = f64(); this.value = f64();
    this.owner = new Int32Array(capacity).fill(-1);
    this.lastHit = new Int32Array(capacity).fill(-1);
    this.burnT = f64(); this.buff = f64(); this.speedBuff = f64();
    this.wave = new Int16Array(capacity);
    this.aux0 = f64(); this.aux1 = f64(); this.hx = f64(); this.hy = f64();
  }

  /** Allocate an entity of `kind` at (x, y). Returns -1 when the pool is exhausted. */
  alloc(kind: Kind, x: number, y: number): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.highWater < this.capacity) i = this.highWater++;
    else return -1;
    this.kind[i] = kind;
    this.uid[i] = this.nextUid++;
    this.def[i] = 0; this.team[i] = 0; this.flags[i] = 0;
    this.x[i] = x; this.y[i] = y; this.px[i] = x; this.py[i] = y;
    this.vx[i] = 0; this.vy[i] = 0; this.fx[i] = 1; this.fy[i] = 0;
    this.radius[i] = 1; this.speed[i] = 0; this.hp[i] = 1; this.maxHp[i] = 1; this.armor[i] = 0;
    this.wDamage[i] = 0; this.wCooldown[i] = 1; this.wRange[i] = 0;
    this.wProjSpeed[i] = 0; this.wProjRadius[i] = 0; this.wPierce[i] = 0; this.wCount[i] = 1; this.wType[i] = 0;
    this.atkT[i] = 0; this.aimT[i] = 0; this.target[i] = -1; this.blockedBy[i] = -1;
    this.life[i] = 0; this.value[i] = 0; this.owner[i] = -1; this.lastHit[i] = -1;
    this.burnT[i] = 0; this.buff[i] = 1; this.speedBuff[i] = 1; this.wave[i] = 0;
    this.aux0[i] = 0; this.aux1[i] = 0; this.hx[i] = x; this.hy[i] = y;
    this.aliveCount++;
    return i;
  }

  release(i: number): void {
    if (this.kind[i] === Kind.None) return;
    this.kind[i] = Kind.None;
    this.pending[this.pendingTop++] = i;
    this.aliveCount--;
  }

  /** Make ids released this tick reusable. Called once at the end of every step. */
  flushFree(): void {
    for (let k = 0; k < this.pendingTop; k++) this.free[this.freeTop++] = this.pending[k];
    this.pendingTop = 0;
  }

  isAlive(i: number): boolean {
    return i >= 0 && this.kind[i] !== Kind.None;
  }

  /** Free-list contents, for the determinism hash (allocation order affects future ids). */
  freeList(): Int32Array {
    return this.free.subarray(0, this.freeTop);
  }
}
