import { describe, expect, it } from 'vitest';
import th from '../src/locales/th.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import { flattenKeys } from '../src/flatten';

describe('locale parity', () => {
  it('th and en define exactly the same keys', () => {
    const thKeys = new Set(flattenKeys(th));
    const enKeys = new Set(flattenKeys(en));
    const missingInEn = [...thKeys].filter((k) => !enKeys.has(k));
    const missingInTh = [...enKeys].filter((k) => !thKeys.has(k));
    expect({ missingInEn, missingInTh }).toEqual({ missingInEn: [], missingInTh: [] });
  });

  it('no value is empty', () => {
    for (const [name, res] of [['th', th], ['en', en]] as const) {
      const empty = flattenKeys(res).filter((k) => {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], res);
        return typeof v !== 'string' || v.trim() === '';
      });
      expect(empty, name).toEqual([]);
    }
  });
});
