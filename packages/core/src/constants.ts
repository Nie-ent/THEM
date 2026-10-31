/** Fixed simulation rate. Everything in core advances in steps of exactly DT seconds. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

/** Max simultaneously alive entities of all kinds. Arrays are preallocated to this size. */
export const CAPACITY = 8192;

/** Entity kinds. Plain const object (not a TS enum) so it survives isolatedModules. */
export const Kind = {
  None: 0,
  Hero: 1,
  Ally: 2,
  Enemy: 3,
  Structure: 4,
  Projectile: 5,
  Pickup: 6,
  Core: 7,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export const Team = { Player: 0, Enemy: 1 } as const;
export type Team = (typeof Team)[keyof typeof Team];

export const PickupType = { Xp: 0, Wood: 1, Stone: 2 } as const;
export type PickupType = (typeof PickupType)[keyof typeof PickupType];

/** Bit flags in `World.flags`. */
export const Flag = {
  Flying: 1,
  IgnoresAggro: 2,
  Flammable: 4,
  Blocking: 8,
  Down: 16,
  Fire: 32,
  Ranged: 64,
  /** Projectile carries a critical hit. */
  Crit: 128,
  /** Entity is a boss or mini-boss (has a BossRuntime). */
  Boss: 256,
} as const;

export const DamageType = { Physical: 0, Fire: 1 } as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

/** Rotation constants for projectile fans (12°). Literal values: trig is not bit-exact across engines. */
export const FAN_COS = 0.9781476007338057;
export const FAN_SIN = 0.20791169081775931;

/** Movement input is quantized to integers in [-INPUT_SCALE, INPUT_SCALE]. */
export const INPUT_SCALE = 127;
