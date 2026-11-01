import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import { effectiveRates } from '../../packages/meta/src/index';
import { displayRates } from '../../apps/game/src/ui/camp/rates';

describe('summon rates display', () => {
  it('effective rates shown at 1 dp sum to exactly 100.0%', () => {
    const shown = displayRates(effectiveRates(content) as Record<number, number>);
    const tenths = Object.values(shown).map((v) => Math.round(v * 1000));
    expect(tenths.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('listed rates sum to 100.0% too', () => {
    const listed = Object.fromEntries(Object.entries(content.gacha.rates).map(([k, v]) => [Number(k), v as number]));
    const tenths = Object.values(displayRates(listed)).map((v) => Math.round(v * 1000));
    expect(tenths.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('adjusts when plain rounding would not sum to 100', () => {
    const shown = displayRates({ 1: 1 / 3, 2: 1 / 3, 3: 1 / 3 });
    expect(Object.values(shown).map((v) => Math.round(v * 1000)).reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
