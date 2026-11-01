# Phase 1 QA test plan (P1-10)

Owner: QA. Scope: `docs/PHASE1.md`. A ticket passes QA only when every **gate** row for it passes;
**manual** rows are checked by QA in a browser and recorded in `docs/qa/findings.md` (failures) or
the sign-off table at the end (passes). Visible tickets also need the designer's sign-off in
`docs/design/review.md`.

## How to run

| Command | What it runs |
| --- | --- |
| `pnpm lint && pnpm typecheck && pnpm test` | ESLint, tsc (incl. `tests/tsconfig.json`), Vitest (packages + `tests/gates/`), Go |
| `pnpm e2e` | Playwright desktop 1280×720 + mobile 390×844: `tests/e2e/smoke.spec.ts`, `tests/e2e/full-run.spec.ts`. Each checkout gets its own port (`E2E_PORT` overrides). Takes > 10 min. |
| `pnpm bench` | Core bench, 500 enemies, budget 4 ms/step mean |
| `pnpm balance [--seeds N]` | Headless balance bot, writes `docs/qa/balance-latest.md` |

## Definition of done → evidence

| DoD item (PHASE1) | Evidence | Pass when |
| --- | --- | --- |
| `pnpm dev` → playable World 1 menu → results, desktop + 390×844 | `full-run.spec.ts` (both projects) + manual play | Run reaches `ended`, results screen shows grade + score, play-again returns to wave 1, no page errors; manual: menu present (P1-08) |
| All strings th/en, no missing keys, no clipped text | `packages/i18n/test/*`, `tests/gates/i18n-usage.test.ts`, smoke "switches language" + manual screenshots per screen per locale | Zero missing keys from content and from `t('…')` in `apps/game/src`; no clipped/overflowing text in any screen at both viewports |
| 500 enemies at 60 fps desktop (bench in CI) | `pnpm bench` | mean ≤ 4 ms/step; manual: 60 fps in dev build with 500 enemies (devtools) |
| Determinism green | `packages/core/test/determinism.test.ts`, `tests/gates/determinism.test.ts` | Identical state hash + score on replay of a JSON-serialised input log for 3 seeds; different seeds diverge |
| Balance (owner decision 31 Oct): planner wins ≈50 %; no-build loses almost always; a loss is C at best | `pnpm balance` (50 seeds) | planner win rate 35–65 %, no-build loss rate ≥ 90 %, 0 losses graded above C |
| QA + designer sign-off recorded | this file + `docs/design/review.md` | Both tables filled |

## Per ticket

### P1-01 Monorepo scaffold
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 1.1 | `pnpm install --frozen-lockfile` on a clean clone | manual | exits 0 |
| 1.2 | `pnpm lint`, `typecheck`, `test`, `build`, `e2e` scripts exist and exit 0 | gate | all 0 |
| 1.3 | `services/cmd/gateway` `/healthz` test | gate (`pnpm test:go`) | passes |
| 1.4 | Vite app boots Phaser canvas + React overlay | gate (smoke "boots") | canvas + HUD visible, no page error |

### P1-02 Core foundation
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 2.1 | Same seed + inputs ⇒ same hash, every 600th tick and at end | gate | equal |
| 2.2 | Core imports no DOM/Phaser/React/i18n/node APIs; no wall clock / `Math.random` | gate (`hygiene.test.ts` + ESLint) | zero hits |
| 2.3 | Bench 500 enemies | gate (`pnpm bench`) | mean ≤ 4 ms/step |
| 2.4 | Event queue: drain returns emission order and clears | gate (core tests) | passes |
| 2.5 | Seeking: core / hero / structure targeting, aggro, ignoresAggro | gate (core `systems.test.ts`) | passes |

### P1-03 Core game systems
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 3.1 | prep ⇄ wave ⇄ ended; call wave early; 25 s prep | gate (core tests, `phase1-scope`) | passes |
| 3.2 | Intel = next wave's enemy ids + side shares | gate (core tests) | matches wave data |
| 3.3 | Upkeep each wave; unpaid ⇒ decay | gate (core tests) | passes |
| 3.4 | Build grid: slots, cost, occupied, not-buildable rejections | gate (core tests) | `rejected` events with reason |
| 3.5 | Draft 1 of 3, 2 rerolls/run, frozen world during draft | gate (core tests, `phase1-scope`) | passes |
| 3.6 | Score + grade = GDD §12 | gate (`scoring.test.ts`, `phase1-scope`) | constants and formula match |
| 3.7 | Every content id resolves in its registry | gate (`content-refs.test.ts`) | zero unresolved |
| 3.8 | Every wave can finish (no unkillable / unreachable enemy) | balance bot (no timeouts) | 0 timeouts in 50+50 runs |

### P1-04 Game app
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 4.1 | Interpolated render, camera follows hero | manual | no jitter at 60 Hz and 144 Hz |
| 4.2 | Keyboard WASD/arrows, Space = call wave, Esc = pause | gate (smoke) | hero moves, phase/pause change |
| 4.3 | Virtual joystick on touch | gate (smoke mobile) | hero moves |
| 4.4 | i18n wired; th default; toggle | gate (smoke) | texts switch |
| 4.5 | No raw colours outside token files | gate (`hygiene.test.ts`) | zero (known: QA-P1-10-002) |
| 4.6 | Mobile: no HUD in bottom 200 px during a wave | gate (smoke mobile) | passes |

### P1-05 Design system
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 5.1 | Tokens TS ⇄ CSS in sync | gate (`tokens.test.ts`, `tokens-sync.test.ts`) | passes |
| 5.2 | Specs exist for every Phase 1 screen, desktop + mobile, th + en | manual (`docs/design/screens/`) | one spec per screen |

### P1-06 World 1 content
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 6.1 | 20 waves, mini-bosses 5/10/15, boss 20, ≥ 6 regular enemy types, 3 mini-bosses | gate (`phase1-scope.test.ts`) | passes |
| 6.2 | Varkul: ≥ 3 phases, enrage timer, ≥ 1 Core-targeting telegraph | gate (`phase1-scope` + core tests) + manual | telegraph has `targetsCore` |
| 6.3 | All strings th/en | gate (i18n) | zero missing |
| 6.4 | Counters force mixed builds | balance bot | no-build fails > 50 %; planner (mixed) wins > 50 % |
| 6.5 | Telegraph windups ≥ 0.7 s | gate (core clamps) + manual | visible ≥ 0.7 s |

### P1-07 Cards, buildings, heroes
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 7.1 | 12 cards (some with drawbacks), 4 buildings (wood wall, stone wall, archer tower, fire-pit), 2 heroes (1★, 2★, different personalities) | gate (`phase1-scope.test.ts`) | passes |
| 7.2 | Effects registered; strings th/en | gate (`content-refs`, i18n) | passes |
| 7.3 | Wood burns, stone does not | gate (`phase1-scope`, core tests) | passes |
| 7.4 | Every building can be targeted and damaged by every enemy that targets structures | balance bot + core tests | no timeout / stuck enemy |

### P1-08 Screens
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 8.1 | Menu (language toggle), HUD, draft, prep/intel/build, pause/settings, results exist with spec testids | gate (smoke + full-run) + manual | all reachable |
| 8.2 | th + en at 1280×720 and 390×844 with no clipped text | manual screenshots (8 per screen) | none clipped |
| 8.3 | Touch targets ≥ 44 px | manual | all ≥ 44 px |
| 8.4 | All `t('…')` keys exist | gate (`i18n-usage.test.ts`) | zero missing |

### P1-09 Placeholder art + VFX
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 9.1 | Silhouettes per readability §4; danger colours from tokens | manual + gate (`hygiene`) | matches spec; no raw colours |
| 9.2 | Hit flash, death, telegraph windup/impact visible | manual | visible at both viewports |
| 9.3 | Perf with VFX: 500 enemies 60 fps desktop | manual (devtools) | ≥ 58 fps median |

## Balance bot

`tests/balance/` — `policy.ts` (heuristic player), `play.ts` (one run), `run.ts` (N seeds × 2 modes,
markdown report). Uses only `@them/core` public API (`createRun`, `step`, `view`, `intel`, `score`)
and reads content data to classify buildings/cards, so it re-runs without changes on new content.
Policy is described at the end of `docs/qa/balance-latest.md`. QA does not tune content from it;
results go to the supervisor.

### P1-11 Engine gaps + QA fixes
| # | Check | Type | Pass/fail |
| --- | --- | --- | --- |
| 11.1 | Slinger soft-lock gone (QA-P1-10-003) | headless repro + balance bot | wave ends; 0 timeouts |
| 11.2 | Loss graded C at best (QA-P1-10-004) | balance report + `screens.spec` results (defeat) | 0 losses above C |
| 11.3 | Token hit-flash (QA-P1-10-002) | gate (`hygiene.test.ts`) | empty allow-list, passes |
| 11.4 | Isolated e2e server (QA-P1-10-005) | `playwright.config.ts` review | own port, never reused |
| 11.5 | Determinism kept after engine changes | gate (determinism) | passes |

## QA sign-off

Final pass on `main` @ 0eecddf, 2026-11-01 (first pass @ 479b63d is in git history).

| Ticket | QA status | Date | Notes |
| --- | --- | --- | --- |
| P1-01 | PASS | 2026-11-01 | scripts green; e2e isolated per checkout |
| P1-02 | PASS | 2026-11-01 | determinism gates green; bench 0.79 ms/step |
| P1-03 | PASS | 2026-11-01 | 003 and 004 closed via P1-11 |
| P1-04 | PASS | 2026-11-01 | 002 closed |
| P1-05 | PASS (QA scope: token sync tests) | 2026-11-01 | UX acceptance is the designer's |
| P1-06 | PASS | 2026-11-01 | scope gate green; 006 (wave-15 spike) open as P2, belongs to P1-12 |
| P1-07 | PASS | 2026-11-01 | scope + registry gates green |
| P1-08 | PASS | 2026-11-01 | `screens.spec` all green th/en × desktop/mobile (incl. text-fits checks); designer PASS recorded |
| P1-09 | PASS with finding | 2026-11-01 | hygiene green; stage-art 10/12 (QA-P1-10-007, test robustness); **designer verdict not yet recorded** in review.md |
| P1-10 | n/a (own ticket) | 2026-11-01 | |
| P1-11 | PASS | 2026-11-01 | see 11.1–11.5 |
| P1-12 | not merged | | balance already in band without it |

## Definition-of-done verdict (2026-11-01, `main` @ 0eecddf)

| DoD item | Verdict | Evidence |
| --- | --- | --- |
| `pnpm dev` → World 1 menu → results, desktop + 390×844 | **PASS** | `full-run.spec` both projects (menu-start → ended → results → play again) |
| th/en, no missing keys, no clipped text | **PASS** | i18n gates; `screens.spec` th/en × 2 viewports with fit checks; designer PASS on P1-08 |
| 500 enemies at 60 fps desktop (bench in CI) | **PASS (bench)** | `pnpm bench` 0.79 ms/step mean (budget 4). Browser fps not measurable on this host (QA-P1-10-007) |
| Determinism green | **PASS** | core + QA determinism gates |
| Planner ≈50 %, no-build loses, loss C at best | **PASS** | `balance-latest.md`: 23/50 (46 %), 0/50, 0 losses above C |
| QA + designer sign-off recorded | **PARTIAL** | QA: this table. Designer: P1-08 PASS; P1-09 row in `docs/design/review.md` still empty |


## Phase 2 QA sign-off (`origin/phase-2` @ c4f201f, 2026-11-01)

New QA tooling: `pnpm balance:progression` (`tests/balance/progression.ts`, `profiles.ts` → `docs/qa/balance-progression.md`),
`tests/gates/save-safety.test.ts`, loadout replay in `tests/gates/determinism.test.ts`, `tests/e2e/save-safety.spec.ts`.

| Ticket | QA status | Evidence | Notes |
| --- | --- | --- | --- |
| P2-01 meta, save, loadout, rewards | PASS with findings | save-safety gate + e2e, loadout determinism gate | QA-P2-003, 004, 005 |
| P2-02 levels, stats | PASS with finding | EXP table = 20·L^2.2; pacing 46/978/2,236 runs | no paid stat reset (QA-P2-002); balance QA-P2-001 |
| P2-03 traits, respec | PASS with finding | data vs GDD §5 keystones; respec costs | crystals have no source (QA-P2-002) |
| P2-04 classes | PASS | 4 + 8 at Lv 10 / 35; class cards via `unlockCards` | class weapons not built (known) |
| P2-05 titles | PASS | 10 titles, collection tiers, ranked off | "Unscarred" approximation (known) |
| P2-06 gear, enhancement | PASS with finding | exact 40.31 / 14.50 | only starter gear obtainable, no scrolls (QA-P2-002) |
| P2-07 heroes | PASS with finding | caps 20…60, limit breaks | essence only on A/S wins (QA-P2-003) |
| P2-08 gacha | PASS | 2 M pulls vs rates and pity; `effectiveRates` within 0.03 pt, shown as the main column | |
| P2-09 specs | not QA's (designer review pending) | | |
| P2-10 Camp screens | PASS (QA functional) | `camp.spec.ts` green both viewports; save-safety e2e | designer review pending |
| P2-11 QA gates | PASS | `phase2-sims.test.ts` green; independent checks agree | |

**Merge recommendation: merge into `main` as `0.2.0-dev`. No P0. Every gate and e2e is green and saves are safe.
Before Phase 2 is called done: the owner must decide QA-P2-001 (how growth meets the difficulty limiter),
because it changes the meaning of every balance number, and the designer must review P2-09/P2-10.
QA-P2-002…005 are P2 and can be scheduled after the merge.**
