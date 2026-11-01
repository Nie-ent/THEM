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
 */
export const SAVE_VERSION = 1;

export interface Migration {
  /** Version the migration reads. It produces version `from + 1`. */
  from: number;
  up(profile: unknown): unknown;
}

export const MIGRATIONS: readonly Migration[] = [];

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
