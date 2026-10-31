# QA findings

Audit of `main` @ 479b63d (P1-01…P1-07 merged; P1-08/P1-09 not yet), 2026-10-31, branch `qa/P1-10`.
Severity: **P0** blocks play / data loss · **P1** breaks a Definition-of-done item or a core rule ·
**P2** quality / tooling. QA reports; the supervisor assigns. Status `open` until QA re-verifies.

Baseline on that commit: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 122/122 + Go ok,
`pnpm bench` mean 0.76 ms/step (p99 12.1 ms) OK, `CI=1 pnpm e2e` 11 passed / 3 skipped (by design),
including the new one-full-run test on both viewports (seed 7: lost on wave 20, grade B, 1332).

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
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
