# Extension points (for laborers)

Content JSON (`packages/content/data/`) names behaviour by **id**; TypeScript registered under that
id in `packages/core/src/effects/` runs it. Schemas: `packages/content/src/schema.ts`. Registry
interfaces (all hooks, with docs): `packages/core/src/registry.ts`. You never edit `api.ts`,
`sim.ts`, `ctx.ts` or `registry.ts`; if you need a new hook or verb, ask the Engineer.

| Content field | Registry | Folder | Worked example |
| --- | --- | --- | --- |
| `cards[].effect` | `cardEffects` | `effects/cards/` | `lifesteal.ts` (hook + drawback), `stat-mods.ts` (pure numbers) |
| `buildings[].behavior` | `buildingBehaviors` | `effects/buildings/` | `tower.ts` (shoots), `static.ts` (walls) |
| `heroes[].personality` | `personalities` | `effects/personalities/` | `cautious.ts` |
| `bosses[].script` | `bossScripts` | `effects/bosses/` | `slam-and-charge.ts` (2 phases, telegraphs, Core attack, enrage) |
| `enemies[].behaviors[].id` | `enemyBehaviors` | `effects/enemies/` | `ignite.ts` (torch-bearer) |

## Steps (same for every registry)

1. **Data.** Add the entry to the JSON file in `packages/content/data/` (world waves:
   `data/worlds/garroth.json`). All numbers go in `params` / fields, never in code.
2. **Strings.** Every `*Key` field gets a value in **both** `packages/i18n/src/locales/th.json` and
   `en.json`. `pnpm test` fails on any missing key (`packages/i18n/test/content-keys.test.ts`).
3. **Code (only if no existing id fits).** Copy the worked example into a new file in the folder above,
   change the `id`, and add `import './your-file';` to that folder's `index.ts`. Many cards need no code:
   use `"effect": "stat-mods"` with params named after `Mods` fields (`damageMult`, `cooldownMult`,
   `projectileCountAdd`, `critChance`, `maxHpMult`, `damageTakenMult`, …; see `src/types.ts`).
4. **Test.** Add a case to `packages/core/test/systems.test.ts` (or a new `test/<ticket>.test.ts`)
   following the "worked examples" block: create a run, `getCtx(run)` to spawn/damage, step, assert.
5. `pnpm lint && pnpm typecheck && pnpm test` green.

## Rules (determinism, CLAUDE.md rule 2)

- Random: `ctx.rng` only. No `Math.random`, `Date`, timers, or `Math.sin/cos/atan2` (lint blocks them;
  use vector math or precomputed constants).
- State: per entity `ctx.w.aux0[e]` / `aux1[e]`; per boss `boss.state.*`; per card
  `ctx.run.cardState['<card-id>.<name>']`. Never module-level variables or closures.
- Act through `ctx`: `damage`, `heal`, `attack`, `fire`, `telegraph`, `ignite`, `spawnEnemy`,
  `nearestEnemy`, `nearestPlayerSide`, `emit`. Time step is `DT` (1/30 s) from `../../constants`.
- Read params with `num(params, 'key', level, fallback)` (arrays = per-level tables).
- Telegraphs: windup ≥ 0.7 s (clamped), shape = hitbox; set `targetsCore: true` for attacks on the
  Core (readability §5). Always pass `owner` so the attack cancels when the caster dies.
- No per-tick allocation in `tick` hooks if you can avoid it (500 enemies × 30 Hz).
