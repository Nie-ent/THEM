/**
 * Displayed summon rates must add up to exactly 100% at the precision shown. Each rate is floored at
 * `digits` decimals and the remaining units go to the largest fractional remainders (stable order).
 */
export function displayRates(rates: Record<number, number>, digits = 1): Record<number, number> {
  const f = 10 ** digits;
  const keys = Object.keys(rates).map(Number).sort((a, b) => b - a);
  const scaled = keys.map((k) => ({ k, v: rates[k]! * 100 * f }));
  const floors = scaled.map((s) => Math.floor(s.v + 1e-9));
  let left = Math.round(100 * f) - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((s, i) => ({ i, r: s.v - floors[i]! })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const o of order) { if (left <= 0) break; floors[o.i]!++; left--; }
  const out: Record<number, number> = {};
  keys.forEach((k, i) => { out[k] = floors[i]! / f / 100; });
  return out;
}
