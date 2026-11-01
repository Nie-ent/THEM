import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS, SAVE_VERSION, migrate, type Migration } from '../src/migrations';
import type { Profile } from '../src/profile';
import { KeyValueSaveService, SaveError, decodeSave, encodeSave, memoryStore } from '../src/save';
import { freshProfile } from './helpers';

const now = () => 1_900_000_000_000;

describe('save envelope', () => {
  it('round-trips the current version', () => {
    const p = freshProfile();
    const r = decodeSave(encodeSave(p, 5));
    expect(r).toEqual({ status: 'ok', profile: p, migratedFrom: null });
  });

  it('flags garbage, wrong format and invalid profiles as corrupt', () => {
    expect(decodeSave('{not json').status).toBe('corrupt');
    expect(decodeSave(JSON.stringify({ format: 'other', version: 1, savedAt: 0, profile: {} })).status).toBe('corrupt');
    expect(decodeSave(JSON.stringify({ format: 'them.save', version: SAVE_VERSION, savedAt: 0, profile: { id: 'x' } })).status).toBe('corrupt');
  });

  it('reports a save from a newer build as newer', () => {
    const r = decodeSave(encodeSave(freshProfile(), 0, SAVE_VERSION + 1));
    expect(r).toEqual({ status: 'newer', version: SAVE_VERSION + 1 });
  });

  it('shipped migrations form a complete chain to SAVE_VERSION', () => {
    const froms = MIGRATIONS.map((m) => m.from).sort((a, b) => a - b);
    expect(froms).toEqual(Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1));
  });
});

/* A synthetic v1 → v2 → v3 chain proves the migration runner before a real v2 exists. */
const V3 = z.object({ name: z.string(), gold: z.number(), gems: z.number() });
type V3 = z.infer<typeof V3>;
const chain: Migration[] = [
  { from: 2, up: (p) => ({ ...(p as object), gems: 0 }) },
  { from: 1, up: (p) => { const { coins, ...rest } = p as { coins: number }; return { ...rest, gold: coins }; } },
];
const v3Opts = { version: 3, migrations: chain, schema: V3 as unknown as z.ZodType<Profile> };

describe('migrations', () => {
  it('runs every step in order and does not mutate the input', () => {
    const v1 = { name: 'a', coins: 7 };
    expect(migrate(v1, 1, 3, chain)).toEqual({ name: 'a', gold: 7, gems: 0 });
    expect(v1).toEqual({ name: 'a', coins: 7 });
  });

  it('throws on a missing or duplicated step', () => {
    expect(() => migrate({}, 1, 3, [chain[1]!])).toThrow(/v2→v3: missing/);
    expect(() => migrate({}, 1, 2, [chain[1]!, chain[1]!])).toThrow(/v1→v2: duplicated/);
  });

  it('decodeSave migrates an old envelope and reports migratedFrom', () => {
    const text = JSON.stringify({ format: 'them.save', version: 1, savedAt: 0, profile: { name: 'a', coins: 3 } });
    const r = decodeSave(text, v3Opts);
    expect(r).toEqual({ status: 'ok', profile: { name: 'a', gold: 3, gems: 0 } as unknown as V3, migratedFrom: 1 });
  });
});

describe('KeyValueSaveService', () => {
  it('empty store → empty; save then load → same profile', async () => {
    const store = memoryStore();
    const s = new KeyValueSaveService(store, { now });
    expect(await s.load()).toEqual({ status: 'empty' });
    const p = freshProfile();
    await s.save(p);
    expect(await s.load()).toEqual({ status: 'ok', profile: p, migratedFrom: null });
    expect(JSON.parse(store.getItem('them.save')!)).toMatchObject({ format: 'them.save', version: SAVE_VERSION, savedAt: now() });
  });

  it('backs up a corrupt save before anything can overwrite it', async () => {
    const store = memoryStore({ 'them.save': '{oops' });
    const s = new KeyValueSaveService(store, { now });
    const r = await s.load();
    expect(r).toMatchObject({ status: 'corrupt', backupKey: 'them.save.corrupt' });
    expect(store.getItem('them.save.corrupt')).toBe('{oops');
  });

  it('never overwrites a save from a newer build', async () => {
    const newer = encodeSave(freshProfile(), 0, SAVE_VERSION + 1);
    const store = memoryStore({ 'them.save': newer });
    const s = new KeyValueSaveService(store, { now });
    expect(await s.load()).toEqual({ status: 'newer', version: SAVE_VERSION + 1 });
    await expect(s.save(freshProfile())).rejects.toMatchObject({ code: 'newer' });
    expect(store.getItem('them.save')).toBe(newer);
  });

  it('keeps the pre-migration save once under <key>.v<old>', async () => {
    const old = JSON.stringify({ format: 'them.save', version: 1, savedAt: 0, profile: { name: 'a', coins: 3 } });
    const store = memoryStore({ 'them.save': old });
    const s = new KeyValueSaveService(store, { now, ...v3Opts });
    expect(await s.load()).toMatchObject({ status: 'ok', migratedFrom: 1 });
    expect(store.getItem('them.save.v1')).toBe(old);
  });

  it('refuses to save an invalid profile', async () => {
    const s = new KeyValueSaveService(memoryStore(), { now });
    const bad = { ...freshProfile(), level: 0 };
    await expect(s.save(bad)).rejects.toBeInstanceOf(SaveError);
  });

  it('wraps a failing store write in SaveError(write-failed)', async () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    const s = new KeyValueSaveService(store, { now });
    await expect(s.save(freshProfile())).rejects.toMatchObject({ code: 'write-failed' });
  });

  it('uses a custom key', async () => {
    const store = memoryStore();
    await new KeyValueSaveService(store, { now, key: 'slot2' }).save(freshProfile());
    expect(Object.keys(store.dump())).toEqual(['slot2']);
  });
});
