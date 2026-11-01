/**
 * QA gate (P2): save safety through the public @them/meta API. Phase 1 browser data, garbage,
 * truncation, newer builds, old versions and failing storage must never crash and never lose a
 * save silently.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import {
  KeyValueSaveService, SAVE_VERSION, encodeSave, memoryStore, newProfile, seededRolls, type KeyValueStore,
} from '../../packages/meta/src/index';

const now = () => 1_800_000_000_000;
const fixture = (v: number) => readFileSync(fileURLToPath(new URL(`../../packages/meta/test/fixtures/save-v${v}.json`, import.meta.url)), 'utf8');
/** What a Phase 1 browser holds: no `them.save`, only best score, language and settings. */
const PHASE1 = { 'them.best': '{"grade":"A","score":1420}', 'them.lang': 'en', 'them.settings': '{"damageNumbers":true}' };

describe('save safety (QA gate, P2)', () => {
  it('Phase 1 browser data: load is empty, Phase 1 keys untouched, first save works', async () => {
    const store = memoryStore({ ...PHASE1 });
    const svc = new KeyValueSaveService(store, { now });
    expect((await svc.load()).status).toBe('empty');
    await svc.save(newProfile(content, { now, rolls: seededRolls(1) }));
    const dump = store.dump();
    for (const [k, v] of Object.entries(PHASE1)) expect(dump[k]).toBe(v);
    expect((await svc.load()).status).toBe('ok');
  });

  const garbage: [string, string][] = [
    ['empty string', ''], ['plain text', 'garbage'], ['null', 'null'], ['number', '42'], ['array', '[]'], ['empty object', '{}'],
    ['truncated JSON', encodeSave(newProfile(content, { now, rolls: seededRolls(2) }), 1).slice(0, 120)],
    ['wrong format tag', JSON.stringify({ format: 'other', version: 3, savedAt: 1, profile: {} })],
    ['version 0', JSON.stringify({ format: 'them.save', version: 0, savedAt: 1, profile: {} })],
    ['current version, broken profile', JSON.stringify({ format: 'them.save', version: SAVE_VERSION, savedAt: 1, profile: { level: 'x' } })],
    ['v1 with profile null', JSON.stringify({ format: 'them.save', version: 1, savedAt: 1, profile: null })],
    ['v2 with heroes.owned a string', JSON.stringify({ format: 'them.save', version: 2, savedAt: 1, profile: { heroes: { owned: 'x' } } })],
  ];
  for (const [name, raw] of garbage) {
    it(`garbage (${name}): corrupt, no throw, raw text backed up`, async () => {
      const store = memoryStore({ 'them.save': raw });
      const r = await new KeyValueSaveService(store, { now }).load();
      expect(r.status).toBe('corrupt');
      if (r.status === 'corrupt') {
        expect(r.backupKey).toBe('them.save.corrupt');
        expect(store.dump()['them.save.corrupt']).toBe(raw);
      }
    });
  }

  it('newer build: load reports newer, save refuses, nothing overwritten', async () => {
    const raw = JSON.stringify({ format: 'them.save', version: SAVE_VERSION + 5, savedAt: 1, profile: { future: true } });
    const store = memoryStore({ 'them.save': raw });
    const svc = new KeyValueSaveService(store, { now });
    expect((await svc.load()).status).toBe('newer');
    await expect(svc.save(newProfile(content, { now, rolls: seededRolls(3) }))).rejects.toThrow();
    expect(store.dump()['them.save']).toBe(raw);
  });

  for (const v of [1, 2]) {
    it(`real v${v} fixture migrates to v${SAVE_VERSION}, keeps its data, backs up the original`, async () => {
      const raw = fixture(v);
      const before = JSON.parse(raw).profile;
      const store = memoryStore({ 'them.save': raw });
      const r = await new KeyValueSaveService(store, { now }).load();
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.migratedFrom).toBe(v);
      expect(r.profile.level).toBe(before.level);
      expect(r.profile.exp).toBe(before.exp);
      expect(r.profile.currencies).toEqual(before.currencies);
      expect(r.profile.heroes.owned.map((h) => h.heroId)).toEqual(before.heroes.owned.map((h: { heroId: string }) => h.heroId));
      expect(store.dump()[`them.save.v${v}`]).toBe(raw);
    });
  }

  it('corrupt save + backup write fails: reported as backupKey null (caller must not overwrite)', async () => {
    const m = memoryStore({ 'them.save': 'garbage' });
    const failing: KeyValueStore = { getItem: m.getItem, removeItem: m.removeItem, setItem: () => { throw new Error('quota'); } };
    const r = await new KeyValueSaveService(failing, { now }).load();
    expect(r).toMatchObject({ status: 'corrupt', backupKey: null });
  });
});
