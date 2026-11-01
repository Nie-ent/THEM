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
| 2026-11-01 | 0eecddf | ok (M1) | ok | ok (M1) | ok (M2) | CHANGES | M1, M2 |
| 2026-11-01 | re-review | ok | ok | ok | ok | PASS | M1 aura is a thin ring under units, no longer floods 200/500 frames; M2 north chevrons clear the HUD on both viewports. P2-11: with the boss bar inset, north chevrons can overlap the Core ring (200-enemy frames); offset them sideways or fade near the Core later. |

**Verdict P1-09: CHANGES (2 small must-fix).** Silhouettes match §4 and every role reads in
grayscale; 2 px outlines everywhere; telegraph wind-up dashed / commit solid + hatch / Core threat
violet double outline + 2 Hz Core pulse + edge arrow with countdown, all distinguishable under
protan/deutan/tritan emulation; burning stages and stone spark-only are right; damage numbers are
pooled BitmapText capped at 24 with merge; load-shedding order matches §8; hero sits at 38% with the
joystick down on 390×844. Stone icon is now point-up everywhere.

Must fix:

1. **M1 Drummer aura floods the field and mimics telegraph fills.** `apps/game/src/game/StageScene.ts`
   (enemy loop, "Pulsing aura on every beat"): the aura is a filled 120 px disc on the `over` layer,
   so with 8+ drummers (200/500-enemy frames) overlapping red discs sit on top of enemy bodies and,
   in grayscale, look like telegraph wind-up fills. Change to what §4 specifies: a **ring**, not a
   disc — `g.lineStyle(2, col(C.enemy), auraAlpha * 2 * (1 - beat))` + `strokeCircle(x, y, rr)` with
   `rr = 120 * beat` (expanding pulse) — and draw it on the `under` graphics (ground plane, below
   units) instead of `over`. Keep the 8% shed step. Re-shoot `enemies-200-*` and `enemies-500-desktop`.
2. **M2 Edge indicators hide under the HUD.** Spawn chevrons from the north side sit behind the
   wave/timer plate on desktop and behind the level/wave row on mobile (`burning-stages-desktop`,
   `telegraphs-core-threat-tritanopia-mobile`), and the Core-threat arrow can do the same when the
   Core is above the view. In `StageScene.ts` `drawEdge` and `fx.ts` `drawEdgeArrow`, clamp to a
   view rect inset by the HUD: top inset 150 px desktop / 180 px portrait (plus boss bar 40 px when
   a boss is up), bottom 24 px desktop / 0 portrait, sides 24 px; pass it as a `Phaser.Geom.Rectangle`
   in screen px divided by zoom. Add one screenshot with north spawn chevrons on each viewport.

P2 notes (do not block):

- P2-5 Self-reported range rings for all towers in prep: this matches readability §4 ("only while
  selected or during prep"). Not a gap. Could thin them to 1 px at 20% if they clutter late-game prep.
- P2-6 No mini-boss spawn name plate in-stage; the HUD boss bar already names it. Add the 2 s plate
  with the next art pass.
- P2-7 "Threat under the thumb" edge markers (§9) not implemented; schedule with phone playtests.
- P2-8 500-enemy fps unmeasured headless (scene.update ≈5.5 ms CPU/frame is within budget on
  paper). QA must measure 60 fps desktop / 300 enemies on a mid-range phone before the phase DoD.
- P2-9 P1-08 screenshots predate the new stage art; regenerate them with `screens.spec.ts` after M1/M2
  so the HUD review set shows real stage backgrounds.
- P2-10 Hit flash uses `damageNormal` as a stand-in; designer to add `stage.hitFlash` token later.

## Phase 2

### P2-09 Camp spec (`docs/design/screens/camp.md`)

| Date | Commit | Direction | Tokens | Phone portrait | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01 | c4f201f | ok | S1 | S4, S5 | CHANGES | S1–S6 |

Structure is sound (one screen, rail on desktop / scrolling strip on phone, one loud thing per tab,
meta-only rules, testids). The spec under-specifies the two screens where players can lose value.
The designer owns these spec edits; the build items below already carry them.

Must fix (spec text):

1. **S1** `surface-sunken` is not a token. Use `--them-color-hud-track` for the EXP track.
2. **S2** "CAMP" in the wireframes and an all-caps title break the direction (sentence case, Thai has
   no case). Write "Camp" / "ค่าย".
3. **S3** Gold drawn as "◆" collides with the Core HP diamond. Gold is a gilt circle glyph + the word.
4. **S4 Enhance risk**: when a drop is possible the spec must require (a) the risk line in
   `semantic-warning` with the warning icon, naming the result level ("On failure: 50% chance to drop
   to +11"); (b) the Enhance button label states the state: "Enhance · may drop" or "Enhance · scroll
   protects"; (c) the protection checkbox resets to off when the selected item changes and is disabled
   with "No scrolls left" at 0; (d) a fail-drop result in `semantic-danger`.
5. **S5 Summon**: rates sit next to (above on phone) the pull buttons, not below pity; column headers
   say what they are ("Overall rate, guarantees included" / "Single pull"); the pity line states the
   hard guarantee ("guaranteed at 80"); displayed rates must sum to 100% at shown precision.
6. **S6 Crystal spends confirm**: trait reset (all / branch) and learning a keystone open the existing
   confirm dialog naming the cost; phone branch selector is a 2×2 grid, not a 4-segment strip.

### P2-10 Camp build

| Screen | Date | Commit | Desktop th | Desktop en | Mobile th | Mobile en | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Character | 2026-11-01 | c4f201f | ok | ok | ok | ok | PASS | N2, N3 |
| Traits | 2026-11-01 | c4f201f | ok | ok | B2 | B2 | CHANGES | B2, B5, B6 |
| Gear + enhance | 2026-11-01 | c4f201f | B1 | B1 | B1 | B1 | CHANGES | B1, B3 (enhance panel not in any shot) |
| Heroes | 2026-11-01 | c4f201f | ok | ok | ok | ok | PASS | N3 |
| Summon | 2026-11-01 | c4f201f | B1 | B1 | B1 | B1 | CHANGES | B1, B4 (judged from code) |
| Titles | 2026-11-01 | c4f201f | ok | ok | B1 | B1 | CHANGES | B1 |
| Results rewards | 2026-11-01 | c4f201f | B1 | B1 | B1 | B1 | CHANGES | B1 (judged from code) |

**Verdict P2-10: CHANGES.** Tokens, layout, Trirong headings, rubric primaries and Thai wrapping are
right; Character, Heroes and the desktop trait columns read well. Blocking items:

Must fix:

1. **B1 10 of 28 screenshots are corrupt** (`camp-summon-*` ×4, `camp-titles-mobile-*` ×2,
   `results-rewards-*` ×4): the PNG signature lost its `\r` (CRLF→LF conversion), so they do not open.
   Add a root `.gitattributes` with `*.png binary`, regenerate all P2-10 shots, and add
   `camp-gear-enhance-{desktop,mobile}-{th,en}.png` with a +11 item selected, protection off, and a
   second set with protection on.
2. **B2 Trait branch selector clips on phones** ("Commander", "ผู้บัญชาการ" cut off).
   `apps/game/src/ui/camp/TraitsTab.tsx`: below `md`, replace the `Segmented` with a 2×2 grid of
   `aria-pressed` buttons (min-h-11, full label, active = `border-focus text-reward`).
3. **B3 Enhance risk is not unmistakable.** `apps/game/src/ui/camp/GearTab.tsx`: (a) render
   `ui.camp.gear.drop` in `text-semantic-warning` with `WarnIcon`, and change the key to name the level:
   "On failure: {{p}} chance to drop to +{{to}}" / "ถ้าพลาด: มีโอกาส {{p}} ลดเหลือ +{{to}}"; (b) Enhance
   label from new keys `ui.camp.gear.enhanceRisk` ("Enhance · may drop") / `enhanceProtected`
   ("Enhance · scroll protects") whenever `dropChance > 0`; (c) `setProtect(false)` in the item
   `onClick`, and `disabled={info.scrolls === 0}` on the checkbox with "No scrolls left" text;
   (d) `fail-drop` result in `text-semantic-danger`.
4. **B4 Summon rates clarity.** `SummonTab.tsx` + locales: `rateEffective` → "Overall rate
   (guarantees included)" / "อัตรารวม (รวมการันตีแล้ว)"; `rateListed` → "Single pull" / "ต่อครั้ง";
   `since5` add "· guaranteed at {{hard}}" / "· การันตีที่ครั้งที่ {{hard}}"; render the Rates section
   before the pull buttons on phones (`order-first` below `md`) or put a "Rates" anchor link beside
   them. Add a unit test that the displayed (1 dp) effective rates sum to 100.0% (today:
   28.2 / 28.2 / 26.8 / 14.4 / 2.4, which is correct).
5. **B5 Crystal spends without confirmation.** `TraitsTab.tsx`: "Reset all", "Reset branch" and
   Learn on a keystone go through the confirm dialog from `PauseScreen.tsx` (extract it to `kit.tsx`)
   with the cost in the title; default focus on Cancel.
6. **B6 All caps.** `CampScreen.tsx` h1: remove `uppercase tracking-wide`; `TraitsTab.tsx` keystone
   label: remove `uppercase` (keep the word and the danger edge).

Nice to have:

1. **N1** Phone tab strip: right-edge fade when it overflows and `scrollIntoView({inline:'nearest'})`
   on the active tab.
2. **N2** Unspent-point badges use rubric fill, which reads as an error; use a gilt outline chip
   (`border-reward text-reward`).
3. **N3** Disabled buttons without a reason ("Spend 0 points", War Chronicle ×10 with 5 left): hide
   ×10 when count < 10; label Spend as disabled-with-hint "Choose points first".
4. **N4** Direction: show a keystone's drawback in the Author annotation block used by card drawbacks
   (pen + Charm "The Author's price" + warning line).
5. **N5** Trait readability: group nodes under tier dividers ("Needs 3 points in this branch") instead
   of repeating the requirement on every card; on phones this halves the scroll.
6. **N6** Thai tab label "Trait" stays English (owner vocabulary from GDD §5); confirm with the owner.

Font risks once Google Fonts load: Trirong "Lv 36" and section headings in Thai at leading-display;
Plex Thai widths in the 2×2 branch grid and the summon table headers.
