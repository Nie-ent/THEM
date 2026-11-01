/**
 * Save format and `SaveService`.
 *
 * On disk a save is one JSON envelope: `{ format: 'them.save', version, savedAt, profile }`.
 * Loading migrates old versions up to `SAVE_VERSION` and validates the result with the zod schema.
 * A save written by a newer build is never overwritten (status `newer`); an unreadable one is copied
 * to a backup key before anything else can replace it (status `corrupt`).
 *
 * `SaveService` is async so the Phase 4 server implementation can drop in unchanged. The local one
 * wraps any key-value store (the app passes `window.localStorage` through its guarded wrapper).
 */
import { z } from 'zod';
import { MIGRATIONS, SAVE_VERSION, migrate, type Migration } from './migrations';
import { Profile } from './profile';

export const SAVE_FORMAT = 'them.save';

const Envelope = z.object({
  format: z.literal(SAVE_FORMAT),
  version: z.number().int().min(1),
  savedAt: z.number(),
  profile: z.unknown(),
});

export type DecodeResult =
  | { status: 'ok'; profile: Profile; migratedFrom: number | null }
  | { status: 'newer'; version: number }
  | { status: 'corrupt'; reason: string };

export interface CodecOptions {
  version?: number;
  migrations?: readonly Migration[];
  schema?: z.ZodType<Profile>;
}

export function encodeSave(profile: Profile, savedAt: number, version = SAVE_VERSION): string {
  return JSON.stringify({ format: SAVE_FORMAT, version, savedAt, profile });
}

export function decodeSave(text: string, opts: CodecOptions = {}): DecodeResult {
  const target = opts.version ?? SAVE_VERSION;
  const migrations = opts.migrations ?? MIGRATIONS;
  const schema = opts.schema ?? Profile;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 'corrupt', reason: 'not JSON' };
  }
  const env = Envelope.safeParse(json);
  if (!env.success) return { status: 'corrupt', reason: `bad envelope: ${z.prettifyError(env.error)}` };
  const { version } = env.data;
  if (version > target) return { status: 'newer', version };
  let migrated: unknown;
  try {
    migrated = migrate(env.data.profile, version, target, migrations);
  } catch (e) {
    return { status: 'corrupt', reason: (e as Error).message };
  }
  const p = schema.safeParse(migrated);
  if (!p.success) return { status: 'corrupt', reason: `invalid profile (v${version}): ${z.prettifyError(p.error)}` };
  return { status: 'ok', profile: p.data, migratedFrom: version < target ? version : null };
}

/* ------------------------------------------------------------------------------------------ */

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; profile: Profile; migratedFrom: number | null }
  /** Written by a newer build. Do not save over it; tell the player to update. */
  | { status: 'newer'; version: number }
  /** Unreadable. The raw text was copied to `backupKey` (null if the backup itself failed). */
  | { status: 'corrupt'; reason: string; backupKey: string | null };

export interface SaveService {
  load(): Promise<LoadResult>;
  /** Throws `SaveError` if the store refuses the write or holds a save from a newer build. */
  save(profile: Profile): Promise<void>;
}

export class SaveError extends Error {
  constructor(readonly code: 'newer' | 'write-failed' | 'invalid', message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** The subset of the Web Storage API the local save needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface KeyValueSaveOptions extends CodecOptions {
  /** Storage key. Default `them.save`. Backups: `<key>.corrupt`, `<key>.v<old version>`. */
  key?: string;
  now(): number;
}

export class KeyValueSaveService implements SaveService {
  readonly key: string;

  constructor(private readonly store: KeyValueStore, private readonly opts: KeyValueSaveOptions) {
    this.key = opts.key ?? 'them.save';
  }

  async load(): Promise<LoadResult> {
    const raw = this.store.getItem(this.key);
    if (raw === null) return { status: 'empty' };
    const r = decodeSave(raw, this.opts);
    if (r.status === 'corrupt') {
      const backupKey = `${this.key}.corrupt`;
      return { ...r, backupKey: this.tryWrite(backupKey, raw) ? backupKey : null };
    }
    // Keep the pre-migration save once, so a bad migration can be recovered by hand.
    if (r.status === 'ok' && r.migratedFrom !== null) {
      const k = `${this.key}.v${r.migratedFrom}`;
      if (this.store.getItem(k) === null) this.tryWrite(k, raw);
    }
    return r;
  }

  async save(profile: Profile): Promise<void> {
    const version = this.opts.version ?? SAVE_VERSION;
    const existing = this.store.getItem(this.key);
    if (existing !== null) {
      const d = decodeSave(existing, this.opts);
      if (d.status === 'newer') throw new SaveError('newer', `stored save is v${d.version}, this build writes v${version}`);
    }
    const check = (this.opts.schema ?? Profile).safeParse(profile);
    if (!check.success) throw new SaveError('invalid', `refusing to save an invalid profile: ${z.prettifyError(check.error)}`);
    try {
      this.store.setItem(this.key, encodeSave(check.data, this.opts.now(), version));
    } catch (e) {
      throw new SaveError('write-failed', (e as Error).message);
    }
  }

  private tryWrite(key: string, value: string): boolean {
    try {
      this.store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory key-value store (tests, and a fallback when browser storage is unavailable). */
export function memoryStore(init: Record<string, string> = {}): KeyValueStore & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}
