# Phase 2 simulations (P2-11)

Gate: `tests/gates/phase2-sims.test.ts` (runs with `pnpm test`, fixed seeds, < 1 s).
Numbers below are from that gate's seeds on 2026-11-01, branch `qa/P2-11-gates`.

| Check | GDD §12 | Measured | Gate tolerance |
| --- | --- | --- | --- |
| Pulls per 5★ (mean) | ≈ 41 | 41.2 (200,000 pulls) | 40 to 42.5 |
| 90% of 5★ within | 65 pulls | 65 | 63 to 67 |
| Longest 5★ gap | ≤ 80 (hard pity) | 71 | ≤ 80 |
| Pulls without 4★ or better | ≤ 10 (10-pull guarantee) | ≤ 10 | ≤ 10 |
| Star shares | 5★ 1.5, 4★ 10, 3★ 28.5, 2★ 30, 1★ 30 (base) | 5★ 2.43, 4★ 14.37, 3★ 26.75, 2★ 28.29, 1★ 28.16 | 3★/2★/1★ keep base proportions ±0.5 pt |
| Enhance +10 → +15, no scroll | ≈ 40 | 40.4 (50,000 items) | ±4% |
| Enhance +10 → +15, scroll every time | ≈ 15 | 14.5 | ±5% |
| Regular, 24 runs/day: Lv 10 / 35 / 50 | day 2 / 41 / 93 | day 2 / 41 / 94 (46 / 978 / 2,236 runs) | exact / ±2 / ±2 |
| VIP (EXP ×1.5, 36 runs/day) | day 1 / 18 / 41 | day 1 / 19 / 42 | exact / ±2 / ±2 |
| Save migrations | — | real fixtures for v1 and v2 load in the v3 build | every older version has a fixture |

## Findings

| ID | Sev | Finding |
| --- | --- | --- |
| QA-P2-11-001 | P2 | **Effective 4★ rate is 14.4%, not the 10% the banner lists**, because the 10-pull guarantee adds 4★s; the effective 5★ rate is 2.4% (pity). GDD §8 says rates are shown clearly. Decide whether the UI shows base rates, effective rates, or both (some app stores and regions require the effective "consolidated" rate). |
| QA-P2-11-002 | P3 | Star shares under 4★ are each about 1.5 points below base because pity moves probability to 4★ and 5★. Expected; listed so the displayed table is not mistaken for observed rates. |

Not simulated yet (no system): VIP is a scenario in the gate only (no VIP flag in the profile);
weekly paid scroll limit; energy.
