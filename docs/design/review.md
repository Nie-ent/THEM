# Design review checklist

The Designer uses this to accept or reject every visible ticket. A ticket passes design review
only when every applicable item is checked. Reject with the item IDs that failed and a screenshot.

## What the laborer must hand in

For each screen touched, four screenshots (PNG, device pixel ratio 1) committed under
`docs/design/review/<ticket>/` or attached to the hand-back:

| Viewport | Thai | English |
| --- | --- | --- |
| Desktop 1280×720 | `<screen>-desktop-th.png` | `<screen>-desktop-en.png` |
| Mobile 390×844 | `<screen>-mobile-th.png` | `<screen>-mobile-en.png` |

Plus, for stage work (P1-09): one 200-enemy screenshot, one grayscale version of it, and the same
frame under deuteranopia emulation (Chrome DevTools > Rendering).

## Checklist

### R1 Tokens and code
- [ ] R1.1 No raw hex, rgb() or px font sizes in components (grep `#[0-9a-fA-F]{3,6}` and `px` in tsx/css outside ui-tokens).
- [ ] R1.2 Fonts come from `--them-font-family-*`; Charm used only for Author voice (≤ 2 uses per screen).
- [ ] R1.3 Spacing uses the 4 px scale; radius follows hierarchy (chip 2, button/card 4, modal 8).

### R2 Layout
- [ ] R2.1 Matches the spec wireframe at 1280×720 and 390×844 (regions in the right place).
- [ ] R2.2 Content left-aligned; only grade stamp / title centered where the spec says.
- [ ] R2.3 No horizontal scroll at 390 px; safe-area insets respected.
- [ ] R2.4 One loud element per screen; gilt under ~5% of the screen.

### R3 Language
- [ ] R3.1 No clipped, truncated or overlapping text in Thai or English.
- [ ] R3.2 Thai tone marks and vowels above/below are not cut (check line-height, overflow hidden).
- [ ] R3.3 Thai wraps on word boundaries (no break inside a word).
- [ ] R3.4 FLEX elements grow; FIXED elements do not move when the language changes.
- [ ] R3.5 No hard-coded strings (switching language changes every visible word).

### R4 Accessibility
- [ ] R4.1 Text contrast ≥ 4.5:1 (body) / 3:1 (≥ 24 px or bold ≥ 19 px); HUD text on plates.
- [ ] R4.2 Meaning never by color alone (shape, icon, text or position too).
- [ ] R4.3 Visible gilt focus ring on every interactive element; logical tab order; Esc behaviour per spec.
- [ ] R4.4 Targets ≥ 44×44 px, 8 px apart on mobile.
- [ ] R4.5 `prefers-reduced-motion` replaces movement with fades.

### R5 Interaction and states
- [ ] R5.1 Every state in the spec's state table is reachable and looks as specified.
- [ ] R5.2 All acceptance criteria (AC-*) of the spec pass.
- [ ] R5.3 Required `data-testid`s present.

### R6 Stage readability (P1-09, P1-04)
- [ ] R6.1 Silhouettes match readability.md §4; roles nameable in grayscale.
- [ ] R6.2 Outlines on all units/projectiles.
- [ ] R6.3 Telegraph wind-up ≥ 700 ms, dashed → solid + hatch; area equals hitbox.
- [ ] R6.4 Core threats use violet double outline, Core pulse, edge arrow off-screen.
- [ ] R6.5 Burning stages visible on wood; stone shows spark only.
- [ ] R6.6 ≤ 24 damage numbers; horde hits show no numbers.
- [ ] R6.7 Hero visible with thumb on joystick at 390×844; no HUD in bottom 200 px during waves.
- [ ] R6.8 Distinguishable under deuteranopia/protanopia/tritanopia emulation.

## Sign-off

Result: Pass / Fail (item IDs). Date as YYYY-MM-DD.

### P1-04 Game app (renderer, camera, joystick, tokens as CSS vars)

| Date | Commit | Desktop th | Desktop en | Mobile th | Mobile en | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

### P1-08 React screens

| Screen | Date | Commit | Desktop th | Desktop en | Mobile th | Mobile en | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Menu | 2026-10-31 | e1e6e04 | ok | ok | ok | ok | CHANGES | M1 |
| HUD | 2026-10-31 | e1e6e04 | ok | ok | ok | ok | CHANGES | M2, M9 |
| Card draft | 2026-10-31 | e1e6e04 | M3, M4 | M3 | M3 | M3 | CHANGES | M3, M4 |
| Prep | 2026-10-31 | e1e6e04 | M5 | M5 | M5, M6 | M5, M6 | CHANGES | M2, M5, M6 |
| Pause / settings | 2026-10-31 | e1e6e04 | M1 | M1 | M1 | M1 | CHANGES | M1, M9 |
| Results | 2026-10-31 | e1e6e04 | M8 | M8 | M7, M8 | M8 | CHANGES | M7, M8, M9 |

**Verdict P1-08: CHANGES.** Structure, hierarchy, tokens and the folio layout are right: no raw hex in
`apps/game/src/ui/`, every required testid is present, primary actions sit in the thumb zone, the
HUD stays in the top 130 px on mobile, Charm stays in the two places it belongs, and the draft has
its 400 ms input lock and select-then-Take flow. Nine fixes before sign-off. Fallback fonts were
judged on layout only; font risks are listed separately.

Accepted as-is: the `ui.tag.*` key family for card tags (keep it, see N3 for one tag); the Tailwind
mappings `text-on-gilt` → `--them-color-semantic-text-on-gilt`, `disabled-text/fill` →
`--them-color-semantic-disabled-*`, `reward-edge` → `--them-color-semantic-reward-edge`. These are the
right tokens and the right names.

#### Must fix

1. **M1 Segmented labels overlap or touch the border** (menu toggle "English", settings "Important|Off",
   "Follow system|On", TH "ตามระบบ|เปิด", "ลอยตามนิ้ว|ซ้าย"). `apps/game/src/ui/kit.tsx` `Segmented`:
   segments use `flex-1` + `whitespace-nowrap` inside a width-constrained group, so they shrink below
   their text. Change the segment class to `flex-none min-w-max` (equal width via
   `grid grid-flow-col auto-cols-fr` on the group instead of `inline-flex`), and in
   `apps/game/src/ui/PauseScreen.tsx` let the settings row put the control under the label when it
   does not fit (`flex-wrap`, control `ml-auto`). Re-shoot both settings and both menu screenshots.
2. **M2 Stone icon reads as a raider.** `kit.tsx` `ResIcon` uses the point-forward `triangle`, the
   exact raider silhouette shown in intel. Draw stone as a point-up triangle (add `triangle-up` to
   `apps/game/src/game/shapes.ts`, use it in `ResIcon`). Affects HUD, prep costs and upkeep.
   (readability.md §4 now says point-up.)
3. **M3 Draft header collides with the HUD** (desktop: "เลเวล 2 เลือกหนึ่งใบ" sits over "120/120";
   mobile: over the Lv/Wave/pause row). In `apps/game/src/ui/GameScreen.tsx`/`Hud.tsx`, render the HUD
   `invisible` (and `aria-hidden`) while the draft is open; the sim is paused, so nothing is lost.
4. **M4 Thai wrap orphans "%"** (desktop TH card 1: "+30" / "%"). In the `Wrap` component in
   `kit.tsx`, do not insert `<wbr>` before a segment that is not word-like (`isWordLike === false`,
   e.g. `%`, `.`, `/`, `)`), i.e. attach punctuation and symbols to the previous segment.
5. **M5 Upkeep line is unreadable.** With no buildings, desktop shows "Upkeep next wave · In stock
   ■20 ▸10" (reads as upkeep 20/10) and mobile shows a stray "↻" beside the hero chips. In
   `apps/game/src/ui/PrepScreen.tsx` `SlotsUpkeep` and the mobile upkeep element, always print the
   upkeep amounts including zeros ("Upkeep next wave ■0 ▲0") and put "In stock ■20 ▲10" on its own
   labelled line. Never render the `↻` prefix alone.
6. **M6 Mobile build tiles are clipped** (EN: "Wood wall ■4" cut, "Archer tower" wraps and pushes
   cost and Burns out of view). `PrepScreen.tsx` `Tile`: replace `h-30` with `min-h-30`, let the
   sheet grow to fit, and show cost, upkeep (`↻`) and Burns/Fireproof on every tile (AC-P3). Add the
   M5 upkeep line to the mobile sheet under the tiles.
7. **M7 Thai quote breaks inside a word on mobile** ("ล้มที่ / นี่"). In
   `apps/game/src/ui/ResultsScreen.tsx`, wrap the heading and the quote text in `<Wrap text=… />`.
8. **M8 Loss results contradict the owner rule.** The defeat screenshot shows grade A and "Reward 100%
   (partial: the run was lost)". The grade cap itself is P1-11 (core), but the UI copy must not
   claim a full reward: change `ui.results.rewardPartial` (th + en) to "Reward {{pct}} · run lost" /
   "รางวัล {{pct}} · แพ้รอบนี้" and show `final.rewardPct` exactly as the sim returns it. Also make the
   results fixture in `tests/e2e/screens.spec.ts` self-consistent (a defeat on wave 1 at 0:00 with
   Core 0% cannot have ×Damage 1.05 and ×Speed 1.15) so the screenshot tests the real layout.
9. **M9 Missing state screenshots** needed to sign AC-H8, AC-S3 and the victory style: add to
   `screens.spec.ts` (both viewports, both languages) `hud-boss` (boss bar + Core-threat frame flash),
   `pause-confirm` (Keep playing focused), `results-victory` (grade S in gilt, boss quote).

#### Nice to have

1. **N1** `ResultsScreen.tsx` recovers the hero hit share by inverting the damage formula. Ask the
   Engineer to expose `coreHpFrac` and `heroDamageShare` on `ScoreBreakdown` so the UI only formats.
2. **N2** Mobile results: the Score is below the fold. Put "Score 2,536" under the grade stamp line.
3. **N3** Drop the "Has a price" tag (`ui.tag.drawback` or equivalent) from cards: the drawback block
   already says it. Also remove the `i18n.exists` filter in `DraftScreen.tsx` so a missing tag key
   fails the i18n test instead of silently disappearing.
4. **N4** Desktop build list clips the second item at the panel edge with no cue: add a bottom fade
   or let the list size to its content (four buildings fit).
5. **N5** Mobile results heading is `text-4xl`; use `text-3xl` below `md` so EN fits on one or two
   lines with room for the quote.

#### Re-review 2026-11-01 at 119e960 (42 screenshots + code)

| Screen | Date | Commit | Desktop th | Desktop en | Mobile th | Mobile en | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Menu | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M1 fixed |
| HUD (+ boss, Core threat) | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M2, M9 fixed; violet Core frame + boss bar + boss line shown |
| Card draft | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M3 HUD hidden, M4 "%" attached, N3 tag dropped |
| Prep | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M5 upkeep 0/0 + in stock, M6 tiles show cost/upkeep/Burns |
| Pause / settings (+ confirm) | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M1 segments wrap under label; Keep playing focused |
| Results (defeat + victory) | 2026-11-01 | 119e960 | ok | ok | ok | ok | PASS | M7, M8 (loss C, 60%, "run lost"), N2 score above fold, N5 |

**Verdict P1-08: PASS** (designer). All M1–M9 resolved; N2, N3, N5 done, N4 resolved by compact rows.
No raw hex in `apps/game/src/ui/`; `Wrap` keeps non-word segments attached; HUD is `invisible` +
`aria-hidden` under the draft.

P2 notes (do not block):

- P2-1 N1 still open: results derives hero hit share by inverting the damage formula; expose
  `heroDamageShare`/`coreHpFrac` on `ScoreBreakdown` when core is next touched.
- P2-2 Mobile Thai boss line wraps leaving one short word ("ต่อ") on line 2; consider `text-wrap: balance`
  on the boss line plate.
- P2-3 Boss line is set in the text face on mobile TH and Charm-like serif on desktop EN; confirm it
  uses `font-hand` consistently once fonts load (it is Author/boss voice, Charm is correct).
- P2-4 Mobile draft: card 3 overlaps the build sheet behind the scrim; harmless (sim paused, HUD hidden)
  but a darker scrim below `md` would read cleaner.

#### Font risks to re-check once Google Fonts load (not failures now)

- Charm Thai in the draft drawback heading sits in a card with `overflow-hidden` at line-height 1.3:
  check that upper tone marks (e.g. "ที่ผู้") are not clipped; raise to `leading-ui` if they are.
- Trirong 800 Thai headings (results, pause) at `leading-display` 1.3: check stacked marks in
  "หยุดชั่วคราว" and two-line mobile headings.
- Plex Sans Thai Looped is wider than the fallback: re-check M1 and M6 widths in Thai.

### P1-09 Placeholder art + VFX

What P1-09 must satisfy (details in `readability.md`; colors only from `tokens.color.stage` via `hexToInt`):

- [ ] **Silhouettes** (§4): raider triangle, torch-bearer triangle + flame dot, brute hexagon (elite fill +
  enemy rim), slinger diamond, wolf rider long chevron + streak, drummer circle + 4 ticks + beat aura,
  mini-boss ×2.2 + crown, Varkul octagon + blot. Every role nameable in a grayscale 200-enemy frame.
  Stone pickup is a point-up triangle and never rotates.
- [ ] **Outline** 2 px `stage.outline` under every unit and projectile; hero ring always on top.
- [ ] **Telegraphs** (§5) on the ground plane: dashed `telegraphWarn` 20% wind-up ≥ 700 ms (boss 1000–1500),
  solid `telegraphImpact` 45% + 45° hatch for the last 300 ms, 1-frame flash; area = hitbox exactly.
- [ ] **Core threat**: violet double outline, Core pulses 2 Hz, edge arrow with countdown arc when the
  Core is off-screen, and the HUD Core frame flash event fires.
- [ ] **Spawn chevrons** at wave start on the sides shown in intel.
- [ ] **Burning** (§6): flame tongues at ignite, darker fill + double flames below 50%, charred outline when
  burnt out; stone shows a 1-frame spark only.
- [ ] **Damage numbers** (§7): Phaser BitmapText, ≤ 24 on screen with merge, none for horde hits,
  crit gilt 18 px, taken red 16 px, respects the Damage numbers setting.
- [ ] **Load shedding** (§8) order respected; telegraphs, outlines, hero ring and edge arrows never dropped.
- [ ] **Evidence**: 500-enemy frame, its grayscale, deuteranopia/protanopia/tritanopia emulation of a
  telegraph + Core-threat frame, and a 390×844 frame with the joystick down showing the hero.

| Date | Commit | Grayscale | CVD emulation | 500-enemy frame | Mobile thumb test | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |
