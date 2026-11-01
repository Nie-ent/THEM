/**
 * @them/meta — meta progression (GDD §4–§8), kept out of the run simulation.
 *
 *   profile  ──buildRunConfig──▶  RunConfig (+ loadout)  ──createRun──▶  run
 *   run ended ──outcomeFromRun──▶ RunOutcome ──applyRunOutcome──▶ profile'  ──SaveService.save
 *
 * Pure TypeScript: no DOM, no wall clock, no Math.random. Time and randomness come in through
 * `MetaEnv`; persistence through `SaveService`.
 */
export { seededRolls, rollId, type MetaEnv, type RollSource } from './env';
export {
  Profile, GearItem, HeroInstance, WorldProgress, STAT_IDS, REWARDED_RUNS_KEPT,
  newProfile, betterGrade, checkMetaContent, type StatId,
} from './profile';
export { SAVE_VERSION, MIGRATIONS, migrate, type Migration } from './migrations';
export {
  SAVE_FORMAT, encodeSave, decodeSave, KeyValueSaveService, SaveError, memoryStore,
  type DecodeResult, type CodecOptions, type LoadResult, type SaveService, type KeyValueStore, type KeyValueSaveOptions,
} from './save';
export {
  CONTRIBUTORS, buildLoadout, buildRunConfig, teamFor,
  type LoadoutPart, type LoadoutContributor, type BuiltLoadout, type RunRequest,
} from './loadout';
export { outcomeFromRun, computeRunRewards, applyRunOutcome, type RunOutcome, type RunRewards, type ApplyResult } from './rewards';
export {
  MetaError, expToNext, runExpFor, grantExp, allocateStats, resetStats, canResetStatsFree, statMods, statsContributor,
  type ExpResult,
} from './progression';
export {
  pointsInBranch, keystonesTaken, traitBlock, allocateTrait, traitResetCost, resetTraits, traitLoadout, traitsContributor,
  checkTraitsContent, type TraitBlock,
} from './traits';
