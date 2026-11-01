# QA findings

First audit: `main` @ 479b63d (2026-10-31). **Final Phase 1 re-verification: `main` @ 0eecddf
(2026-11-01)**, branch `qa/P1-final` (P1-01…P1-11, P1-08 fixes, P1-09 art; P1-12 tuning not merged).
Severity: **P0** blocks play / data loss · **P1** breaks a Definition-of-done item or a core rule ·
**P2** quality / tooling. QA reports; the supervisor assigns.

Final baseline @ 0eecddf: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 146/146 + Go ok,
`pnpm bench` mean 0.79 ms/step (p95 3.1, p99 12.5) OK, `CI=1 pnpm e2e` 68 passed / 8 skipped (by design) /
**2 failed** (QA-P1-10-007, reproduced on a second run), 15.7 min,
`pnpm balance` planner 23/50 wins, no-build 0/50.

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
| QA-P1-10-001 | P1 | balance (P1-06/07) | Planner bot won 3/50; DoD balance criterion failed | **closed** 2026-11-01: 23/50 (46%) vs owner target ≈50%; no-build 0/50 |
| QA-P1-10-003 | P1 | core + content (P1-03/07) | Slingers targeted fire-pit traps they could never hit, so the wave never ended | **closed** 2026-11-01 (P1-11): ranged enemies skip non-blocking structures; repro now finishes, 0 timeouts in 100 bot runs |
| QA-P1-10-004 | P1 | scoring (P1-03) | Losing early earned grade A | **closed** 2026-11-01 (P1-11, owner decision): same repro now C; 0 of 77 bot losses graded above C |
| QA-P1-10-002 | P2 | game app (P1-04) | Raw colour `0xffffff` (hit flash) in StageScene.ts | **closed** 2026-11-01 (P1-11): token hit-flash; hygiene gate has an empty allow-list and passes |
| QA-P1-10-005 | P2 | tooling (P1-01) | `pnpm e2e` reused a foreign server on port 4173 | **closed** 2026-11-01 (P1-11): per-checkout port, `reuseExistingServer: false` |
| QA-P1-10-007 | P2 | e2e (P1-09) | `stage-art` 200- and 500-enemy crowd tests fail on desktop: crowd never spawns at ~6 fps headless | **closed** 2026-11-01 @ c4f201f: passes on desktop and mobile |
| QA-P1-10-006 | P2 | balance (P1-12) | Planner losses still cluster on wave 15 (9 of 27) and wave 20 (6); P1-12 smoothing not merged | open |

Re-verification notes:
- 001: the bot policy and seeds are unchanged since the first audit, so the numbers are comparable.
  The new DoD rows in `balance-latest.md` use QA bands: planner win rate 35–65 %, no-build loses ≥ 90 %.
- 003: the headless repro below now has the slingers walk to the Core (target = Core) and the wave
  ends. Fix confirmed in `sim.ts` (`if (ranged && !(w.flags[s] & Flag.Blocking)) continue;` in targeting).
- 004: the repro is lost on wave 3 with grade C (performance 1.36 would have been A).

--- | --- | --- | --- | --- |
| QA-P1-10-001 | P1 | balance (P1-06/07) | Planner bot wins 3/50; DoD "planner wins A/B on most seeds" fails | open |
| QA-P1-10-003 | P1 | core + content (P1-03/07) | Slingers target fire-pit traps but their shots can never hit them, so the wave never ends | open |
| QA-P1-10-004 | P1 | scoring (P1-03) | Losing early earns grade A (speed multiplier uses partial time) | open |
| QA-P1-10-002 | P2 | game app (P1-04) | Raw colour `0xffffff` (hit flash) in StageScene.ts | open |
| QA-P1-10-005 | P2 | tooling (P1-01) | `pnpm e2e` reuses whatever is on port 4173; fails or tests the wrong build across worktrees | open |

---

## QA-P1-10-001 — P1 — Balance: planner wins 3/50 (DoD needs most)

**Repro:** `pnpm balance` (50 seeds, normal, recommended power, both AI heroes). Report:
`docs/qa/balance-latest.md`.

**Expected:** PHASE1 DoD: the planner completes 20 waves with A/B on most seeds; no-build fails.

**Actual:** planner 3/50 wins (2 B, 1 A), mean wave 16.5. Losses: 24 hero deaths, 23 Core
destructions, clustered at **wave 15** (fire-priest, 14 losses) and **waves 19–20** (16).
no-build 0/50 wins (fails as intended, mostly Core at waves 10–14). The no-build half of the DoD
passes; the planner half fails.

Diagnostic (not committed): the same planner with its HP refilled every tick wins only 7/20, so
the gap is not only the bot's dodging: the Core also falls at 15/19/20 with 10–12 structures up.
Laborer A's "completable" test uses an invulnerable hero and Core, so it cannot catch this.

Caveat: the bot is a simple heuristic (see the report). A stronger policy may do better. The DoD
bar is "recommended power", so either content gets easier around waves 15 and 19–20, or the
supervisor redefines which player the bot stands in for. QA does not tune.

## QA-P1-10-003 — P1 — Slinger vs fire-pit trap: wave can never end

**Repro (headless):** seed 3, no AI heroes, invulnerable hero standing still at spawn. During prep
build only `fire-pit-trap` on cell 32 (2 rows above the Core), call each wave. On wave 3 every
slinger picks the fire-pit as its target (`targeting: "structure"`, nearest structure) and keeps
firing. After 600 s the wave is still running: `waveAlive 5`, three slingers targeting the
fire-pit, which is still at 99/120 HP (that damage is torch-bearer fire only).

Seen in the wild: before a bot fix, planner seed 11 sat in wave 14 for 3,170 s of sim time with
one slinger aiming at a full-HP fire-pit.

**Cause (for the assignee):** `projectileSystem` in `packages/core/src/sim.ts` (around line 1017)
skips structures without `Flag.Blocking`
(`if (kind === Kind.Structure && !(w.flags[t] & Flag.Blocking)) continue;`), and the fire-pit is
`"blocking": false`. Meanwhile `chooseEnemyTarget` returns non-blocking structures for
`targeting: "structure"`. Ranged structure-hunters can never damage a trap, never retarget, and
never walk to the Core.

**Expected:** every wave can end. Ranged enemies can damage what they target, or never target
what they cannot hit.

**Actual:** an enemy is stuck forever unless the hero walks over and kills it. A player who stays
near the Core (or an AFK one) soft-locks the run. Gate coverage: the QA determinism test fails if
any of its 3 seeds times out. The balance report counts timeouts.

## QA-P1-10-004 — P1 — Grade A for losing on wave 2

**Repro (headless):** seed 1, no AI heroes, hero stands still, picks card 0, calls every wave
early. The run is lost on wave 2 after 0.9 min of play. `score()` gives grade **A**:
`mSpeed 1.30` (clamped max), `mDamage 1.00`, performance 1.30.

In the balance report every no-build run that **lost** gets B or A, and planner losses are mostly
A or S.

**Cause:** `M_speed = standardTime / actualTime` with `actualTime` = time played so far. A short
losing run beats the 1,500 s standard and gets the max multiplier.

**Expected:** GDD §3: a loss pays a partial reward by waves cleared. A loss should not grade as
well as a clean win. GDD §12 does not cover scoring on a loss, so this needs a design decision.
Options: grade C on a loss, scale the standard time by waves cleared, or no speed bonus on a loss.

**Actual:** losing fast is graded like a near-perfect win (A, 100 % reward).

## QA-P1-10-002 — P2 — Raw colour literal in StageScene

**Where:** `apps/game/src/game/StageScene.ts:271`: `img.setTint(0xffffff)` for the hit flash.

**Expected:** CLAUDE.md rule 4: colours come from `@them/ui-tokens` (readability spec: "2-frame
white hit flash" should be a token).

**Actual:** hard-coded white. Gate `tests/gates/hygiene.test.ts` allow-lists this one occurrence
by this id. When it is fixed the gate fails with "QA-P1-10-002 fixed?" until the allow-list entry
is removed.

## QA-P1-10-005 — P2 — e2e reuses a foreign server on port 4173

**Repro:** with another worktree's `vite preview` on :4173 (e.g. a parallel agent), run
`pnpm e2e` in this worktree.

**Expected:** e2e tests the build of the current checkout.

**Actual:** `reuseExistingServer: !process.env.CI` attaches to the other server, so the run tests
another branch's build. In the first audit run that server stopped mid-run and 8/12 tests failed
with `ERR_CONNECTION_REFUSED`. With `CI=1` (own server) all passed. Suggest a per-worktree port
(env `E2E_PORT`) or `reuseExistingServer: false`.

## QA-P1-10-006 — P2 — Wave 15 and wave 20 still spike (P1-12 open)

**Repro:** `pnpm balance` @ 0eecddf. Planner loss waves: w15×9, w16×4, w17×4, w20×6, others ≤ 1.
Losses are mostly hero deaths (21 of 27).

**Expected:** P1-12 asks to smooth the wave-15 and wave-19/20 spikes.

**Actual:** the overall win rate is on target (46 %), but a third of losses still happen on the
fire-priest wave. P1-12 has not been merged, so this is tracking only: it does not block the DoD.

## QA-P1-10-007 — P2 — stage-art crowd tests fail on desktop headless

**Repro:** `CI=1 pnpm exec playwright test stage-art` @ 0eecddf. Failing on desktop:
"200-enemy frame, grayscale, and 500-enemy frame" and "500-enemy frame and render rate"
(`crowd()` polls for ≥ 198 / ≥ 498 enemies, gets 4–5 after 20 s). Mobile passes. Failed the same
way in two separate runs.

**Cause (measured):** in this container the 1280×720 software-GL canvas renders about 6 fps,
and the sim advances only about 3 ticks/s (`session.advance(delta)` gets Phaser's capped frame
delta). `crowd()` pushes its spawns at the end of `spawnQueue`, behind wave 1's 8 raiders spaced
0.6 s apart. They only come out after `waveTime` ≥ 4.2 s, which takes about 40 s of wall time,
longer than the 20 s poll.

**Expected:** the evidence test does not depend on how fast the host renders. For example, put the
crowd at the spawn cursor, or step the sim from the test.

**Actual:** the test fails, and the 500-enemy frame-rate evidence (DoD "60 fps") cannot be
captured on this host. The core bench (CI DoD item) passes.

Side note for the engineer: at very low frame rates the sim runs slower than real time (about 10 %
at 6 fps). Real devices do not drop that low, so this is not filed separately.


---

# Phase 2 review (`origin/phase-2` @ c4f201f, 2026-11-01, branch `qa/P2-review`)

Baseline: lint 0, typecheck 0 (incl. `tests/`), `pnpm test` 301/301 (281 product + 20 new QA gate tests) + Go ok,
`CI=1 pnpm e2e` 82 passed / 8 skipped (by design) in 14.0 min incl. `camp.spec.ts`, plus the new
`save-safety.spec.ts` 6/6. `pnpm balance` (bare loadout) is unchanged from Phase 1: 23/50 and 0/50.
The e2e run rewrote the committed screenshots in `docs/design/screenshots/`. QA reverted them; none are committed.

**GDD numbers checked independently** (scripts on the public `@them/meta` API, not the product tests):
| Item | GDD | Measured | OK |
| --- | --- | --- | --- |
| EXP to next = 20 × L^2.2, cap 50 | Lv10 3,170 · Lv35 49,890 | table equals round(20·L^2.2) for L 1–49 (0 diff); cap 50 | yes |
| Runs (grade A, 50 + 20L) to Lv 10 / 35 / 50 | 45 / 980 / 2,230 (day 2 / 41 / 93) | 46 / 978 / 2,236 (day 1.9 / 40.8 / 93.2) | yes |
| Enhancement +10→+15 | 40.3 / 14.5 attempts | exact Markov 40.31 / 14.50 | yes |
| Gacha 5★ | mean 41, 90 % within 65 | 2 M pulls: mean 41.09, p90 65, max 73; p5 = 1.5 % → 7.5 % at pull 60, +6 %/pull, 100 % at 80 | yes |
| 10-pull 4★ guarantee | ≥ 1 per 10 | longest run without 4★+ = 10 | yes |
| `effectiveRates()` vs simulation | shown as main rates | 5★ 2.426 / 2.434 %, 4★ 14.410 / 14.401 %, 3★ 26.78 / 26.76 % (≤ 0.03 pt); Summon tab shows them as the bold column | yes |
| Pity across banners | carried | counters live in `profile.gacha`, not per banner (only 1 banner exists, so not observable in UI) | yes (structural) |
| Hero level caps by stars | 20/30/40/50/60 (+5 ×2) | same | yes |
| Classes Lv 10 (4) / Lv 35 (8) | | 4 + 8, tier levels 10 / 35 | yes |
| Keystones | Glass Cannon +80 % / −50 % HP; Lone Wolf no heroes, all stats +40 %; Fortress Lord hero can't attack, ×2 | data matches; Lone Wolf as dmg/HP +40 %, speed +15 %, crit +10 %; Fortress Lord approximated as hero dmg −75 % (both noted in HANDOFF) | approx. |
| Respec | free ≤ Lv 10; partial (branch **or stats**) cheaper | traits: free ≤ 10, 2 / 1 crystals. **Stats: no reset of any kind after Lv 10** (QA-P2-002) | partly |

**Save safety:** `tests/gates/save-safety.test.ts` (Phase 1 browser keys, 12 kinds of garbage, a newer build,
real v1/v2 fixtures, a failing backup write) and `tests/e2e/save-safety.spec.ts` (the same through the app's
ProfileStore in a real browser) are green. No crash, the raw text is always backed up, newer saves are never
overwritten, and migrations keep level, EXP, currencies and heroes. Gaps: QA-P2-004.

**Determinism:** product tests only hash a few ticks with a loadout. The QA gate now replays two full
runs with the Lv 50 loadout (JSON config + JSON input log) to the same hash and score, and checks that
the loadout changes the run. Green.

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
| QA-P2-001 | P1 | balance / design (P2-01…07) | Account growth trivialises World 1: Lv 10 planner wins 93 %, Lv 50 **no-build** wins 100 % with grade S | open, owner decision |
| QA-P2-002 | P2 | economy / UI (P2-03, 04, 06, 07) | Dead-end items and actions: Rewind Crystals, Class Seals, protection scrolls, large EXP books and all non-starter gear have no source; no stat reset at any price after Lv 10 | open |
| QA-P2-003 | P2 | rewards (P2-01, 06, 07) | Item rewards are floored: B/C wins pay 0 world essence, S pays no item bonus, losses before wave 14 pay 0 stones | open |
| QA-P2-004 | P2 | save (P2-01, P2-10) | Corrupt save is replaced without telling the player; if the backup write fails it is still overwritten; "newer save" only shows as a tooltip | open |
| QA-P2-005 | P2 | save (P2-01) | Phase 1 progress (`them.best`) is not credited: a Phase 1 winner starts with Garroth uncleared and no Garroth Victor title | open |

## QA-P2-001 — P1 — Progression trivialises World 1 (difficulty limiter not fed)

**Repro:** `pnpm balance:progression --seeds 30` → `docs/qa/balance-progression.md`. Same QA bot and
seeds as `balance-latest.md`. Each profile is played through `buildRunConfig`.

| Profile (≈ day at 24 grade-A runs/day) | planner wins | no-build wins | grades (planner) |
| --- | --- | --- | --- |
| bare / new profile (day 0) | 13/30 (43 %) | 0/30 | 0 S / 8 A / 5 B / 17 C |
| Lv 10, Warrior, +5 gear (day 2) | 28/30 (93 %) | 0/30 | 4 S / 20 A / 4 B / 2 C |
| Lv 20, Warrior, +10 gear, heroes Lv 20 (day 11) | 30/30 | 3/30 | 15 S / 14 A / 1 B |
| Lv 50, Berserker + Juggernaut, +15 Warlord set, 4 heroes 5★ (late) | 30/30 | **30/30, all S** | 30 S |

The Lv 50 loadout sums to damage +147 %, HP +180 %, armour +0.375, crit +22 %, AI heroes ×3–4.
Every run passes `power: undefined`, i.e. recommended power, so the limiter (cap +10 %) never applies.

**Expected:** GDD §3 "จำกัดผลของการฟาร์ม": power above recommended gives diminishing returns, at most
about +10 %. Planning should keep mattering; owner target ≈50 % for the planner at recommended power.

**Actual:** two days of play nearly doubles the planner's win rate. A maxed account clears World 1 with
grade S without building anything (DoD Phase 1: "no-build loses almost always"). Needs an owner decision
on how account growth meets the limiter, e.g. scale the loadout's mods by the limiter, or compute power from the
loadout and normalise by world, before more worlds are built on top. Note: the strong profile uses gear
that cannot be obtained today (QA-P2-002). With obtainable gear (+15 starting kit), the outcome is the
same or close to it, given the Lv 20 row.

## QA-P2-002 — P2 — Dead-end currencies, items and actions

Sources today: gold (100 per grade-A clear), enhancement stones (3), small EXP books (2),
Essence of Garroth (1), star shards (gacha duplicates only).
| Item / action | Used by | Source | UI today |
| --- | --- | --- | --- |
| Rewind Crystal (`time-crystal`) | trait reset after Lv 10 (2 full / 1 branch) | none | reset buttons enabled; press → "not enough" error |
| Class Seal | changing class (not first pick or promotion) | none | change buttons show cost, disabled |
| Protection scroll | +11…+15 drop protection | none | "protect" checkbox shown with ×0 |
| Large EXP book | hero EXP 1,000 | none | listed at ×0 |
| Gear other than Worn Blade / Padded Vest (Hunter Bow, Ember Staff, Warlord set, Traveler Charm) | gear tab | none (no drops, no shop) | only the starter kit can ever appear |
| Stat reset after Lv 10 | GDD §5 partial respec "only Stats" with fewer crystals | not implemented | "free reset has ended", no paid option |
| "Free reset after a balance patch" (GDD §5) | | not implemented | (known, HANDOFF) |

**Expected:** GDD §5: "free players must find crystals by playing". A Phase 2 UI should not offer an
action that can never succeed, or it should say where the item comes from.

## QA-P2-003 — P2 — Item rewards round down to nothing

**Repro:** `computeRunRewards` for Garroth at Lv 20:
| Outcome | gold | stones | essence | small books |
| --- | --- | --- | --- | --- |
| win S (120 %) | 120 | 3 | 1 | 2 |
| win A | 100 | 3 | 1 | 2 |
| win B (80 %) | 80 | 2 | **0** | 1 |
| win C | 60 | 1 | 0 | 1 |
| lose on wave 11 (0.6 × 10/20) | 30 | **0** | 0 | 0 |

**Expected:** grade scales rewards. S should pay more than A, and every win should progress hero limit
breaks (5 + 15 essence per hero).

**Actual:** `Math.floor(count × factor)` on counts of 1–3 erases the bonus or the whole reward. Essence comes
only from A/S wins. Suggest stochastic rounding through the meta RNG, or carrying the remainder in the profile.

## QA-P2-004 — P2 — Corrupt / newer save handling is silent

**Repro:** `tests/e2e/save-safety.spec.ts` "garbage save": the app boots with a fresh profile, the raw
text is in `them.save.corrupt`, and the player sees no message. `save-safety.test.ts` shows that when the
backup write fails, `load()` returns `backupKey: null`. `ProfileStore.load()` (`apps/game/src/game/profile.ts`)
then still writes a new profile over `them.save`, so the old data is gone. A "newer" save shows its
explanation only as the `title` tooltip of the disabled Camp button, which does not exist on touch.

**Expected:** no silent loss. Tell the player that the save was reset and that a backup exists. Do not
overwrite when the backup failed (play in memory, as for `newer`). Show the newer-build notice as visible text.

## QA-P2-005 — P2 — Phase 1 results are not carried over

**Repro:** `them.best = {"grade":"A","score":1420}` (a Phase 1 win), load Phase 2. Profile: `worlds` is empty and
no titles are unlocked. The menu still shows the best score from `them.best`.

**Expected / actual:** owner choice. Either import `them.best` into `worlds.garroth` (cleared, best grade
and score) on first load, or accept that Phase 2 starts fresh and say so. Low impact: only testers have Phase 1 data.
