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
| QA-P1-10-007 | P2 | e2e (P1-09) | `stage-art` 200- and 500-enemy crowd tests fail on desktop: crowd never spawns at ~6 fps headless | open |
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
