/**
 * The local player profile (P2-01): loaded once at startup from localStorage through `@them/meta`'s
 * SaveService, turned into each run's config, and updated with the run's rewards when it ends.
 *
 * Failure policy (never block play):
 * - no save → a new profile is created and saved;
 * - corrupt save → the raw text is kept under `them.save.corrupt`, then a new profile replaces it;
 * - save from a newer build → play runs without a profile (Phase 1 config) and nothing is written;
 * - storage unavailable → the profile lives in memory for the session.
 */
import { content } from '@them/content';
import type { Run, RunConfig } from '@them/core';
import {
  KeyValueSaveService, applyRunOutcome, buildRunConfig, memoryStore, newProfile, outcomeFromRun, seededRolls,
  type KeyValueStore, type LoadResult, type MetaEnv, type Profile, type RunRewards, type SaveService,
} from '@them/meta';

function browserStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    ls.getItem('them.save'); // throws when storage is blocked
    return {
      getItem: (k) => { try { return ls.getItem(k); } catch { return null; } },
      setItem: (k, v) => ls.setItem(k, v), // errors surface as SaveError(write-failed)
      removeItem: (k) => { try { ls.removeItem(k); } catch { /* ignore */ } },
    };
  } catch {
    return memoryStore();
  }
}

function entropy(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Date.now() >>> 0;
  }
}

export class ProfileStore {
  profile: Profile | null = null;
  loadStatus: LoadResult['status'] | 'loading' = 'loading';
  /** Rewards of the last recorded run (for the results screen, P2-10). */
  lastRewards: RunRewards | null = null;
  readonly ready: Promise<void>;
  private readonly env: MetaEnv;

  constructor(private readonly saves: SaveService, env?: MetaEnv) {
    this.env = env ?? { now: () => Date.now(), rolls: seededRolls(entropy()) };
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    let r: LoadResult;
    try {
      r = await this.saves.load();
    } catch {
      r = { status: 'corrupt', reason: 'load threw', backupKey: null };
    }
    this.loadStatus = r.status;
    if (r.status === 'newer') return;
    this.profile = r.status === 'ok' ? r.profile : newProfile(content, this.env);
    if (r.status !== 'ok' || r.migratedFrom !== null) await this.persist();
  }

  /** Config for a new run. Before the profile loads (or with a newer save) this is the Phase 1 config. */
  runConfig(worldId: string): RunConfig {
    return this.profile ? buildRunConfig(this.profile, content, { worldId }) : { worldId };
  }

  /** Apply an ended run's rewards once (by runId) and save. */
  recordRun(run: Run, runId: string): void {
    if (!this.profile) return;
    const r = applyRunOutcome(this.profile, outcomeFromRun(run, runId), content, this.env.now());
    this.lastRewards = r.rewards;
    if (!r.applied) return;
    this.profile = r.profile;
    void this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.profile) return;
    try {
      await this.saves.save(this.profile);
    } catch {
      /* storage full / blocked: keep playing with the in-memory profile */
    }
  }
}

export const profileStore = new ProfileStore(new KeyValueSaveService(browserStore(), { now: () => Date.now() }));
