/**
 * Save schema versions and migrations.
 *
 * Changing the shape of `Profile` (profile.ts)? Then, in the same change:
 *   1. bump `SAVE_VERSION`;
 *   2. append `{ from: <old version>, up }` to `MIGRATIONS`, where `up` turns a v<old> profile
 *      object into a v<old + 1> one (pure, total: fill defaults, never throw on missing optional data);
 *   3. add a fixture of the old save to `test/fixtures/` and a test that it loads.
 * Never edit or remove a shipped migration: players may still hold saves at any old version.
 *
 * v1 (Phase 2, P2-01): first versioned save.
 * v2 (P2-05): `totals.kills` (lifetime kills, for titles). v1 saves start it at 0.
 * v3 (P2-07): `heroes.owned[].limitBreaks` (world-essence limit breaks). Older heroes start at 0.
 */
export const SAVE_VERSION = 3;

export interface Migration {
  /** Version the migration reads. It produces version `from + 1`. */
  from: number;
  up(profile: unknown): unknown;
}

/** Shallow object guard for migrations: never throw on odd data, let the schema reject it. */
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    up(profile) {
      const p = obj(profile);
      const totals = obj(p.totals);
      return { ...p, totals: { ...totals, kills: typeof totals.kills === 'number' ? totals.kills : 0 } };
    },
  },
  {
    from: 2,
    up(profile) {
      const p = obj(profile);
      const heroes = obj(p.heroes);
      const owned = Array.isArray(heroes.owned) ? heroes.owned : [];
      return {
        ...p,
        heroes: {
          ...heroes,
          owned: owned.map((h) => {
            const o = obj(h);
            return { ...o, limitBreaks: typeof o.limitBreaks === 'number' ? o.limitBreaks : 0 };
          }),
        },
      };
    },
  },
];

/**
 * Runs `migrations` from `version` up to `target`. Throws if a step is missing or duplicated.
 * Pure: the input object is not modified (each step receives a structured clone).
 */
export function migrate(profile: unknown, version: number, target: number, migrations: readonly Migration[]): unknown {
  let p = structuredClone(profile);
  for (let v = version; v < target; v++) {
    const steps = migrations.filter((m) => m.from === v);
    if (steps.length !== 1) throw new Error(`save migration v${v}→v${v + 1}: ${steps.length === 0 ? 'missing' : 'duplicated'}`);
    p = steps[0]!.up(p);
  }
  return p;
}
