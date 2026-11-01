# THEM — handoff to Claude Code

Written 2026-11-01 at the end of Phase 1 (main `3373c6a`). Read this first, then `CLAUDE.md`,
then `docs/GDD.md` (Thai, the full design). This file tells you where the project stands, how the
code is organised, how to work in it safely, and what to build next.

---

## 1. Where things stand

**Phase 1 is complete and signed off by QA and the Designer.** One world is playable end to end in
the browser on desktop and phone, in Thai and English.

| Area | What exists |
| --- | --- |
| World | ทุ่งเลือดการ์รอธ / Garroth Bloodfields, 20 waves (`packages/content/data/worlds/garroth.json`) |
| Enemies | raider, torch-bearer, brute, slinger, wolf-rider, war-drummer |
| Bosses | Brannok (w5), Kharsa (w10), Ashmoth (w15), Varkul (w20, 3 phases, enrage 180 s) |
| Kit | 12 cards (6 with drawbacks), 4 buildings (wood wall, stone wall, archer tower, fire-pit), 2 AI heroes (Brann 1★ reckless, Mira 2★ cautious) |
| Loop | 25 s prep (build/sell, place heroes, wave intel) ⇄ wave (auto-attack, XP, card draft 1-of-3, 2 rerolls) → results |
| Scoring | GDD §12 formula; grades S/A/B/C; **a loss is always C (60% reward)** |
| UI | React screens: menu, HUD, card draft, prep, pause/settings, results — desktop 1280×720 and phone 390×844 portrait |
| Stage art | Geometric placeholders with full readability language (silhouettes, telegraphs, Core-threat arrow, burning, bitmap damage numbers, load shedding) |
| Backend | `services/` Go skeleton only (`/healthz`); nothing online yet |

**Quality at sign-off:** 146 unit tests, 68 e2e passing (8 skipped by design), determinism green,
`pnpm bench` 0.79 ms/step mean at 500 enemies (budget 4 ms), balance bot planner wins 46% / no-build 0%.

**Owner decisions already made (don't relitigate):**
- Loss grade is capped at C. Target difficulty: planning bot wins ≈50% on World 1.
- Phones stay portrait. Fonts: Trirong, IBM Plex Sans Thai Looped, Charm (Author's voice only).
- Web first, architecture ready to scale; Go for concurrency-heavy backend, game sim stays TS.
- Global Level cap 50 in v1; class tiers at Lv 10 and Lv 35 (tier 3 at Lv 60 is future).
- Enhancement can fail and drop level from +11; protection scrolls from farming, wandering merchant,
  events and capped weekly paid packs. VIP 99 THB/30 days (EXP ×1.5, energy regen ×1.5).
- Use Figma only through the user's Chrome (Claude in Chrome), never the Figma MCP.

---

## 2. Run it

```bash
pnpm install
pnpm dev            # game at http://localhost:5173 (menu → Start)
pnpm lint && pnpm typecheck && pnpm test     # must stay green on every change
pnpm bench          # core perf, fails above 4 ms/step mean
pnpm balance        # 50-seed bot report → docs/qa/balance-latest.md
CI=1 pnpm e2e       # Playwright, desktop + mobile, ~16 min; port derived per checkout (E2E_PORT overrides)
```

Debug hooks: `window.__them.session` (the live `GameSession`) is used by e2e and the balance bot.
URL `?seed=N` fixes the run seed.

---

## 3. Code map

```
packages/core       Pure TS simulation. No DOM/Phaser/Math.random/Date. 30 Hz fixed step, seeded RNG.
  src/api.ts          Public API: createRun, step, drainEvents, view, intel, score, stateHash …
  src/sim.ts          Systems and tick order          ┐ engine-owned: change only for engine work,
  src/ctx.ts          Verbs effects may call          │ with tests; laborer-style tickets never
  src/registry.ts     Hook interfaces                 ┘ edit these four files
  src/world.ts        SoA entity store (fixed iteration order — reason in the file header)
  src/scoring.ts      GDD §12 score + grade (+ loss cap)
  src/effects/        Content behaviours by id: cards/ buildings/ personalities/ bosses/ enemies/
  src/effects/README.md   ← the recipe for adding content; follow it exactly
packages/content    JSON data + zod schemas (src/schema.ts). All balance numbers live here.
packages/meta       Phase 2 meta progression (pure TS): profile, versioned save + SaveService, loadout → createRun,
                    run rewards → profile. App side: apps/game/src/game/profile.ts
packages/i18n       i18next; locales/th.json + en.json; wrap.ts = Thai line breaking (Intl.Segmenter)
packages/ui-tokens  Design tokens (TS + generated CSS vars `--them-*`). Designer-owned.
apps/game
  src/game/           Phaser 4.2.1 stage: StageScene.ts, art.ts (baked silhouettes), telegraphs.ts,
                      fx.ts (burning, edge arrows, damage numbers), session.ts (sim ↔ renderer ↔ UI),
                      bridge.ts + store.ts (typed events → HUD store), input.ts
  src/ui/             React screens + kit.tsx (shared components), settings.ts, storage.ts (guarded)
services/           Go 1.24 module github.com/nie-ent/them/services (gateway skeleton, proto/sim.proto)
tests/gates         Repo-wide gates: determinism, content refs, i18n usage, hygiene (no raw hex,
                    core purity), phase-1 scope counts
tests/balance       Headless heuristic bot (planner / no-build) driving core through the public API
tests/e2e           smoke, screens (writes docs/design/screenshots/P1-08), stage-art (…/P1-09), full-run
docs/               GDD.md, PHASE1.md, design/ (direction, readability, screens/, review.md), qa/
```

**Data flow:** content JSON → `createRun(config, content, seed)` → `step(run, inputs)` at 30 Hz →
events drained by `session.ts` → Phaser renders interpolated views; React reads the HUD store (≤10×/s).

---

## 4. How to work here

**Hard rules** are in `CLAUDE.md` (no hard-coded text, determinism, content over code, tokens only,
perf budget, green gates). The gates enforce most of them; don't weaken a gate to get green.

**Adding content:** `packages/core/src/effects/README.md`. Data first, strings in both locales,
code only if no existing id fits, a test per behaviour.

**Engine changes** (`api.ts`, `sim.ts`, `ctx.ts`, `registry.ts`, schema): add tests, keep the
determinism replay green, re-run `pnpm bench` and `pnpm balance`, and update the effects README if a
verb or hook changes.

**UI changes:** read the screen spec in `docs/design/screens/` first and check against
`docs/design/review.md` (checklist R1–R6). Desktop 1280×720 and phone 390×844, Thai and English.
Phones: HUD at top, nothing in the bottom 200 px, select-then-confirm for card picks and placement.

**Team mode (optional).** Phase 1 ran as a supervisor plus subagents (engineer, designer, laborers, QA).
If you do the same:
- Give each subagent its own git worktree under `.claude/worktrees/` (ignored by git and ESLint).
  A subagent stays locked to the worktree it started in — for a new ticket, check out a new branch
  *inside that same worktree* rather than creating another one.
- Run at most 2 subagents at once. Four in parallel used up a 5-hour usage window in about 2 hours.
- Laborer tickets that edit the same locale files merge cleanly if each keeps its keys in one
  contiguous block per prefix.
- A visible change is done only when QA *and* the Designer pass it.

**Commits:** conventional messages (`feat(core): …`), small and focused, using the attribution
trailer your environment specifies.

**Gotchas**
- `screens.spec.ts` and `stage-art.spec.ts` overwrite committed screenshots under
  `docs/design/screenshots/`. Revert them (`git checkout -- docs/design/screenshots`) unless you
  meant to regenerate.
- Headless Chromium uses software GL (~2–6 fps): two desktop crowd tests in `stage-art.spec.ts` can
  time out (QA-P1-10-007). Real-device fps is still unmeasured.
- Google Fonts may be blocked in sandboxed environments; screenshots then render fallback fonts.
- The Thai GDD is the source of truth for design intent; `docs/PHASE1.md` and this file record scope
  and decisions.

---

## 5. Open backlog carried from Phase 1

| ID | Sev | Item |
| --- | --- | --- |
| QA-P1-10-006 | P2 | Planner losses cluster at wave 15 (Ashmoth); smooth the spike when tuning |
| QA-P1-10-007 | P2 | Desktop crowd e2e flaky on software GL; make the poll robust or gate it |
| P2-1 (design) | P2 | Expose the hero's damage share from core; results currently back-computes it |
| P2-2 | P2 | Mobile Thai boss line leaves one short word on line 2 (`text-wrap: balance`) |
| P2-3 | P2 | Confirm boss line uses Charm on every viewport once fonts load |
| P2-4 | P2 | Darker scrim behind the mobile card draft |
| P2-6 | P2 | Mini-boss name plate for 2 s on spawn |
| P2-7 | P2 | "Threat under the thumb" edge markers (readability §9) |
| P2-8 | P1 | **Measure fps at 500 enemies on a real phone and desktop** |
| P2-10 | P2 | Dedicated `stage.hitFlash` token (designer) |
| P2-11 | P2 | North spawn chevrons can overlap the Core ring when the boss bar shows |

Full detail: `docs/qa/findings.md`, `docs/design/review.md`.

---

## 6. What to build next: Phase 2 (meta progression)

Source: GDD §4 (levels, stats), §5 (Trait Tree, respec), §6 (classes), §7 (titles), §8 (stars,
upgrades, gacha), §12 (numbers). Hub, energy, online and payments are later phases.

**Architecture rule for Phase 2:** keep meta progression *out of* the run simulation. Add
`packages/meta` (pure TS) that owns the profile (levels, stats, traits, class, gear, heroes, titles,
currencies) and turns it into a **loadout** passed to `createRun`. Core only consumes the loadout as
modifiers. This keeps runs deterministic, lets ranked mode normalise the loadout later, and lets the
server own the profile in Phase 4. Persist through a `SaveService` interface (localStorage now) with a
versioned save schema and migrations from day one. Gacha and enhancement rolls go through one
injectable RNG module so they can move server-side.

| Ticket | Owner | Scope |
| --- | --- | --- |
| P2-01 | Engineer | `packages/meta`: profile model, versioned save + migrations, `SaveService`, loadout → `createRun`, run rewards → profile (grade reward %) |
| P2-02 | Engineer | Global Level (cap 50, EXP to next = 20 × L^2.2, run EXP 50 + 20 × L at grade A) and 5 stats (พลังกาย, ปัญญา, ความว่องไว, ความอึด, การบัญชาการ) → run modifiers |
| P2-03 | Engineer + content | Trait Tree: 4 branches, keystones with trade-offs, hybrid nodes, card-modifying traits; respec (free until Lv 10, partial respec cheaper) |
| P2-04 | Content | Classes: tier 1 at Lv 10 (4), tier 2 at Lv 35 (8); class card pools and trait extensions |
| P2-05 | Engineer + content | Titles: achievement engine, equip one, collection bonus |
| P2-06 | Engineer + content | Equipment and enhancement (+1–+10 safe; +11–+15 at 60/50/40/30/20% with 50% drop on fail; protection scroll) |
| P2-07 | Engineer + content | Hero stars 1–5, hero level, upgrade items (EXP books, star shards, world essence) |
| P2-08 | Engineer | Gacha with in-game currency only: 5★ 1.5%, 4★ 10% (10-pull guarantee), 3★ 28.5%, 2★ 30%, 1★ 30%; soft pity from pull 60 (+6%/pull), hard pity 80, carried across banners; rates shown in UI |
| P2-09 | Designer | Specs for the new screens: character/stats, trait tree, class pick, equipment + enhance, hero roster, gacha, titles; desktop + phone, th + en |
| P2-10 | Laborer | Build P2-09 screens to spec |
| P2-11 | QA | Gates and sims: gacha distribution (≥100k pulls vs rates and pity), enhancement expected attempts, progression pacing (days to Lv 10 / 35 / 50 at 24 runs/day), save migration tests |

**Decisions to ask the owner before or during Phase 2:**
1. Art sourcing for real in-stage art (commission an artist, buy a 2D asset pack, or AI images + cleanup).
   Recommended as a parallel "art pass" once the owner has playtested Phase 1 on real devices.
2. Whether a premium currency appears in Phase 2 UI or waits for payments (Phase 6).
3. Results of the owner's real-device playtest (fps at waves 16–20, fun of the core loop).

### Phase 2 progress (branches `engineer/P2-01-meta` → `P2-02-levels-stats` → `P2-03-traits`, stacked, not merged to main)

| Ticket | Status |
| --- | --- |
| P2-01 | Engineer done, gates green; awaiting QA. `packages/meta` + `apps/game/src/game/profile.ts` |
| P2-02 | Engineer done, gates green; awaiting QA. `packages/meta/src/progression.ts`, numbers in `content/data/meta.json` |
| P2-03 | Engineer + content done, gates green; awaiting QA. `content/data/traits.json` (4 branches, 23 nodes), `packages/meta/src/traits.ts`; core `Loadout.cardParams` / `cardWeights` |
| Fixes from owner playtest (2026-11-01) | Desktop build clicks below the Core (joystick zone ate mouse clicks); game froze on the first hit on the hero (dead scene listener after StrictMode double mount); ember-ring had no visual (new core `pulse` event). Each on its own `engineer/fix-*` branch, merged into the P2 branch |

Defaults the owner accepted on 2026-11-01 ("ok, continue"), all data in `meta.json`:
- Loss reward = C band (60%) × waves cleared / wave count, for currencies and account EXP.
- Garroth base reward 100 gold. No premium currency yet. Stat ids: strength, intellect, agility, vitality, command.
- 3 stat points + 1 trait point per Global Level; free stat reset up to Lv 10.
- Per point: strength +1% damage; intellect −0.5% cooldown; agility +0.5% speed, +0.3% crit; vitality +1.5% HP,
  +0.002 armour; command +1.2% structure and AI-hero damage. Caps in `statCaps`.

Open balance question: player **power** is not fed to the difficulty limiter yet. Stats already act as
direct modifiers; feeding power too would count them twice. Decide how account growth meets the limiter
(GDD §3) before a second world exists. No UI yet to spend stat points (P2-09/P2-10).

Trait Tree (P2-03) notes, for the owner and the designer:
- Keystones: one at a time (`limits.keystones`), 10 branch points + 3 trait points each. Fortress Lord is
  approximated as hero damage −75% (not 0) with structures and AI heroes ×2; a real "hero cannot attack"
  needs a core flag.
- Reset: free to Lv 10, then 2 Rewind Crystals (full) or 1 (one branch, also refunds hybrids that need it).
  Rewind Crystals have no source yet (shop, events and Raid come later); "free reset after a balance patch"
  (GDD §5) is not implemented and needs a save-schema change when it is.
- Trait points: 1 per Global Level → 49 at Lv 50; one full branch with its keystone costs about 16.

---

## 7. Links and accounts

- Repo: `github.com/Nie-ent/THEM`, branch `main`. Work through the owner's personal account `Nie-ent`
  only. A local tag `v0.1.0-phase1` was created but could not be pushed from the previous
  environment; create it on GitHub if wanted.
- FigJam board (flows, wireframes, palette): https://www.figma.com/board/ZGUnhet9tcDZuf4VD9thcz/THEM
  — access only through Claude in Chrome.
- The claude.ai artifacts "THEM Playtest" (latest build) and "THEM Production Line" (ticket board) and
  the Claude Doc GDD live in the owner's claude.ai account. If you can't publish artifacts, use
  `pnpm dev` for playtesting and keep ticket status in `docs/`.
