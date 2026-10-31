# Phase 1 — playable prototype of World 1

Goal: prove that Survivors combat + base building is fun. One world, 20 waves, start to finish, in
Thai and English, on desktop and phone. Geometric placeholder art; no backend; save to localStorage.

Design source: `docs/GDD.md` §3 (core loop, difficulty), §4 (levels), §8 (heroes), §12 (numbers).

## In scope

- **World 1 — ทุ่งเลือดการ์รอธ (Garroth Bloodfields).** Rule: torch-bearers set wooden structures on
  fire; players choose wood (cheap, burnable) or stone (costly, fireproof).
- 20 waves. Mini-bosses on 5, 10, 15. Boss **Varkul, the Unbeaten** on 20 (3 phases, telegraphed
  attacks, one attack that targets the Core, enrage timer).
- Prep phase 25 s between waves (can call the wave early for speed score). **Wave intel**: enemy types
  and spawn directions of the next wave.
- Hero: moves only, auto-attacks. In-stage level-up → choose 1 of 3 skill cards (2 rerolls per run).
- 12 skill cards (some with drawbacks), 4 buildings (wood wall, stone wall, archer tower, fire-pit
  trap), limited build slots, per-wave upkeep.
- 2 AI heroes (1★ reckless melee, 2★ cautious ranged) placed during prep.
- Enemies: raider, torch-bearer, brute (armored elite), slinger (ranged), wolf rider (fast, ignores
  aggro), war drummer (buffs nearby). Counters must force mixed builds (GDD §3 "ศัตรูแก้ทาง").
- Lose: hero dies or Core destroyed. Score + grade S/A/B/C per GDD §12. Results screen.
- Screens: title/menu (language toggle), HUD, card draft, prep + intel + build, pause/settings,
  results. Desktop keyboard + mobile virtual joystick.

## Out of scope

Accounts, server, gacha, Trait Tree, classes, titles, hub, energy, other worlds, real art, audio
beyond placeholder bleeps.

## Tickets

| ID | Owner | Ticket | Depends on |
| --- | --- | --- | --- |
| P1-01 | Engineer | Monorepo scaffold: pnpm workspaces, TS strict, ESLint, Vitest, Playwright, Vite app booting a Phaser 4 scene + React overlay, `services/` Go skeleton (`go.mod`, `cmd/gateway` with `/healthz`, `proto/` placeholder), root scripts `dev/build/lint/typecheck/test/e2e` | — |
| P1-02 | Engineer | Core foundation: seeded RNG, 30 Hz fixed step, ECS (bitECS), spatial hash, movement, collision, hero input, enemy seeking (Core / hero / aggro), weapons, projectiles, damage, death, event queue for the renderer, `api.ts` (create / step / read / events). Determinism test (same seed+inputs ⇒ same state hash). Perf bench: 500 enemies | P1-01 |
| P1-03 | Engineer | Core game systems + extension points: run state machine (prep ⇄ wave ⇄ results), wave spawner reading content, intel preview, resources & upkeep, build grid & slots, XP/level/card draft (rerolls), effect registry for cards/buildings/heroes, hero-AI behaviour framework (personalities), boss script framework (phases, telegraphs, enrage), scoring & grade | P1-02 |
| P1-04 | Engineer | Game app: Phaser scene renders sim with interpolation, camera, keyboard + virtual joystick, React overlay host + event bridge, i18n wiring (`packages/i18n`, Thai line breaking), tokens consumed as CSS vars | P1-01, P1-05 tokens |
| P1-05 | Designer | `packages/ui-tokens`, `docs/design/` specs for every screen (desktop + mobile, th + en), in-stage readability rules (silhouettes, danger colors, telegraphs, damage numbers, touch zones), flows + wireframes on the FigJam board | — |
| P1-06 | Laborer A | World 1 content: 6 enemies, 3 mini-bosses, Varkul scripts, waves 1–20, intel data, all strings th/en | P1-03 |
| P1-07 | Laborer B | 12 skill cards, 4 buildings, 2 AI heroes as data + effects via registries, strings th/en | P1-03 |
| P1-08 | Laborer C | React screens: menu, HUD, card draft, prep/intel/build, pause/settings, results | P1-04, P1-05 |
| P1-09 | Laborer A/B | Placeholder geometric art + hit/death/telegraph VFX per readability rules | P1-04, P1-05 |
| P1-10 | QA | Test plan, determinism + i18n completeness tests, e2e smoke (desktop + mobile, th + en), headless balance bot that plays 20 waves and reports grade distribution | P1-03 onward |

## Definition of done (phase)

- `pnpm dev` → playable World 1 from menu to results on desktop and a 390×844 viewport.
- All strings switch between Thai and English with no missing keys and no clipped text.
- 500 enemies hold 60 fps on desktop (bench in CI).
- Determinism test green. Balance bot completes 20 waves at recommended power with grade A or B on
  most seeds and fails without building towers (planning matters).
- QA and designer sign-off recorded in `docs/qa/` and `docs/design/review.md`.
