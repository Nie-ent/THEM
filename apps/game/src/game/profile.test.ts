/** QA-P2-004: a corrupt save is never overwritten unless its backup exists (or the player chooses). */
import { describe, expect, it } from 'vitest';
import { KeyValueSaveService, memoryStore, seededRolls, type KeyValueStore } from '@them/meta';
import { ProfileStore } from './profile';

const GARBAGE = '{not a save';
const env = () => ({ now: () => 1_800_000_000_000, rolls: seededRolls(1) });

/** A store whose writes to the backup key fail until `allowBackup` is set. */
function flakyStore() {
  const inner = memoryStore({ 'them.save': GARBAGE });
  const ctl = { allowBackup: false };
  const store: KeyValueStore = {
    getItem: (k) => inner.getItem(k),
    removeItem: (k) => inner.removeItem(k),
    setItem: (k, v) => {
      if (k === 'them.save.corrupt' && !ctl.allowBackup) throw new Error('quota');
      inner.setItem(k, v);
    },
  };
  return { store, inner, ctl };
}

describe('ProfileStore corrupt-save safety (QA-P2-004)', () => {
  it('backup succeeds: fresh profile is saved over the corrupt one, backupKey reported', async () => {
    const inner = memoryStore({ 'them.save': GARBAGE });
    const ps = new ProfileStore(new KeyValueSaveService(inner, { now: () => 0 }), env());
    await ps.ready;
    expect(ps.loadStatus).toBe('corrupt');
    expect(ps.backupKey).toBe('them.save.corrupt');
    expect(ps.saveBlocked).toBe(false);
    expect(inner.dump()['them.save.corrupt']).toBe(GARBAGE);
    expect(inner.dump()['them.save']).not.toBe(GARBAGE);
  });

  it('backup fails: original is kept, profile lives in memory, nothing is written', async () => {
    const { store, inner } = flakyStore();
    const ps = new ProfileStore(new KeyValueSaveService(store, { now: () => 0 }), env());
    await ps.ready;
    expect(ps.loadStatus).toBe('corrupt');
    expect(ps.backupKey).toBeNull();
    expect(ps.saveBlocked).toBe(true);
    expect(ps.profile).not.toBeNull();
    // A later change (e.g. a Camp action) still must not overwrite the original.
    expect(ps.act((p) => ({ ...p })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(inner.dump()['them.save']).toBe(GARBAGE);
  });

  it('writing resumes once a retried backup succeeds', async () => {
    const { store, inner, ctl } = flakyStore();
    const ps = new ProfileStore(new KeyValueSaveService(store, { now: () => 0 }), env());
    await ps.ready;
    ctl.allowBackup = true;
    ps.act((p) => ({ ...p }));
    await new Promise((r) => setTimeout(r, 0));
    expect(ps.saveBlocked).toBe(false);
    expect(ps.backupKey).toBe('them.save.corrupt');
    expect(inner.dump()['them.save.corrupt']).toBe(GARBAGE);
    expect(inner.dump()['them.save']).not.toBe(GARBAGE);
  });

  it('the player can explicitly discard the old save', async () => {
    const { store, inner } = flakyStore();
    const ps = new ProfileStore(new KeyValueSaveService(store, { now: () => 0 }), env());
    await ps.ready;
    await ps.discardOldSave();
    expect(ps.saveBlocked).toBe(false);
    expect(inner.dump()['them.save']).not.toBe(GARBAGE);
  });
});
