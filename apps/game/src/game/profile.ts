/**
 * The local player profile (P2-01, UI in P2-10): loaded once at startup from localStorage through
 * `@them/meta`'s SaveService, turned into each run's config, updated with the run's rewards when it
 * ends, and changed by the Camp screen through `act()`.
 *
 * Failure policy (never block play):
 * - no save → a new profile is created and saved;
 * - corrupt save → the raw text is copied to `them.save.corrupt`, then a new profile replaces it;
 *   if that backup could not be written (or the load itself failed), the original is NEVER
 *   overwritten: play continues with a fresh in-memory profile (`saveBlocked`), and every later save
 *   first retries the backup (a re-load). Writing resumes once the backup exists, the slot turns out
 *   empty, or the player explicitly chooses to discard the old save (`discardOldSave()`) (QA-P2-004);
 * - save from a newer build → play runs without a profile (Phase 1 config) and nothing is written;
 * - storage unavailable → the profile lives in memory for the session.
 */
import { useSyncExternalStore } from 'react';
import { content } from '@them/content';
import type { Run, RunConfig } from '@them/core';
import {
  KeyValueSaveService, MetaError, applyRunOutcome, buildRunConfig, memoryStore, newProfile, outcomeFromRun, seededRolls,
  unlockTitles,
  type ApplyResult, type KeyValueStore, type LoadResult, type MetaEnv, type Profile, type RollSource, type SaveService,
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

/** What an action returns: a new profile, or an object carrying one plus anything the UI shows. */
type ActResult<T> = Profile | ({ profile: Profile } & T);

export class ProfileStore {
  profile: Profile | null = null;
  loadStatus: LoadResult['status'] | 'loading' = 'loading';
  /** Where the unreadable save was copied (status `corrupt`); null if that copy failed. */
  backupKey: string | null = null;
  /**
   * True while the stored save must not be overwritten: it is unreadable and no backup of it exists
   * yet (or loading failed outright). The profile then lives in memory only.
   */
  saveBlocked = false;
  /** The last recorded run (rewards, levels gained, new titles) for the results screen. */
  lastRun: ApplyResult | null = null;
  /** Titles unlocked by the last Camp action (shown once by the Camp). */
  lastTitles: string[] = [];
  readonly ready: Promise<void>;
  readonly env: MetaEnv;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly saves: SaveService, env?: MetaEnv) {
    this.env = env ?? { now: () => Date.now(), rolls: seededRolls(entropy()) };
    this.ready = this.load();
  }

  get rolls(): RollSource {
    return this.env.rolls;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /** Changes whenever the profile or run result changes (for useSyncExternalStore). */
  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private async load(): Promise<void> {
    let r: LoadResult;
    try {
      r = await this.saves.load();
    } catch {
      r = { status: 'corrupt', reason: 'load threw', backupKey: null }; // → saveBlocked
    }
    this.loadStatus = r.status;
    if (r.status === 'corrupt') {
      this.backupKey = r.backupKey;
      this.saveBlocked = r.backupKey === null;
    }
    if (r.status !== 'newer') {
      this.profile = r.status === 'ok' ? r.profile : newProfile(content, this.env);
      if (r.status !== 'ok' || r.migratedFrom !== null) await this.persist();
    }
    this.notify();
  }

  /** Config for a new run. Before the profile loads (or with a newer save) this is the Phase 1 config. */
  runConfig(worldId: string): RunConfig {
    return this.profile ? buildRunConfig(this.profile, content, { worldId }) : { worldId };
  }

  /** Apply an ended run's rewards once (by runId) and save. */
  recordRun(run: Run, runId: string): void {
    if (!this.profile) return;
    const r = applyRunOutcome(this.profile, outcomeFromRun(run, runId), content, this.env.now());
    this.lastRun = r;
    if (r.applied) {
      this.profile = r.profile;
      void this.persist();
    }
    this.notify();
  }

  /**
   * Run a profile action from the UI. Returns the extra result fields on success, or the MetaError
   * code (for `ui.camp.error.<code>`) on refusal. Titles earned by the change are unlocked too.
   */
  act<T extends object = object>(fn: (p: Profile) => ActResult<T>): { ok: true; value: T | null } | { ok: false; code: string } {
    if (!this.profile) return { ok: false, code: 'no-profile' };
    let out: ActResult<T>;
    try {
      out = fn(this.profile);
    } catch (e) {
      if (e instanceof MetaError) return { ok: false, code: e.code };
      throw e;
    }
    const next = 'profile' in out && !('id' in out) ? out.profile : (out as Profile);
    const titled = unlockTitles(next, content);
    this.lastTitles = titled.unlocked;
    this.profile = { ...titled.profile, updatedAt: Math.max(titled.profile.updatedAt, this.env.now()) };
    void this.persist();
    this.notify();
    return { ok: true, value: 'profile' in out && !('id' in out) ? (out as T) : null };
  }

  /** Test / debug hook: replace the whole profile (e2e seeds a rich profile through this). */
  replace(p: Profile): void {
    this.profile = p;
    void this.persist();
    this.notify();
  }

  /** The player explicitly accepts losing the unreadable save: allow writing over it. */
  async discardOldSave(): Promise<void> {
    this.saveBlocked = false;
    await this.persist();
    this.notify();
  }

  /**
   * Retry backing up the blocked save by loading again (the save service copies an unreadable save
   * to its backup key on load). Unblocks only when overwriting is now safe: the backup exists or the
   * slot is empty. A readable or newer save stays protected.
   */
  private async retryBackup(): Promise<boolean> {
    try {
      const r = await this.saves.load();
      if (r.status === 'empty') return true;
      if (r.status === 'corrupt' && r.backupKey !== null) {
        this.backupKey = r.backupKey;
        return true;
      }
    } catch {
      /* still failing */
    }
    return false;
  }

  private async persist(): Promise<void> {
    if (!this.profile) return;
    if (this.saveBlocked) {
      if (!(await this.retryBackup())) return;
      this.saveBlocked = false;
      this.notify();
    }
    try {
      await this.saves.save(this.profile);
    } catch {
      /* storage full / blocked: keep playing with the in-memory profile */
    }
  }
}

export const profileStore = new ProfileStore(new KeyValueSaveService(browserStore(), { now: () => Date.now() }));

// Read-only debug hook for e2e and owner testing (same spirit as window.__them).
if (typeof window !== 'undefined') (window as unknown as { __themProfile?: ProfileStore }).__themProfile = profileStore;

/** Re-render on any profile change; returns the current profile (null while loading / newer save). */
export function useProfile(): Profile | null {
  useSyncExternalStore(profileStore.subscribe, profileStore.getVersion);
  return profileStore.profile;
}
