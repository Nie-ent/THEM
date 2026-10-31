# In-stage HUD

React overlay above the Phaser canvas (`z-hud`). The HUD must never compete with the stage: small,
on `color-semantic-hud-plate` plates, pinned to edges, and silent unless something changes.

## Orientation decision: portrait on phones, no forced landscape

Gameplay does **not** force landscape. Reasons:

1. The game is a web page; forcing rotation on a browser is unreliable (Screen Orientation lock only
   works in fullscreen on Android, not at all on iOS Safari) and a rotate-your-phone wall loses players.
2. Movement is one thumb (auto-attack). Portrait is held one-handed with the thumb on the joystick,
   which suits short sessions.
3. The arena is centered on a Core the player orbits; a taller view shows more of the base behind
   the hero when they run out to farm (camera puts the hero at 38% from top, see readability §9).
4. The menus, card draft and results are text-heavy in Thai; portrait gives longer line lengths for
   wrapped Thai than a 390 px tall landscape.

Landscape on phones is **supported** (same layout as desktop scaled to the short side, HUD with
safe-area insets), just not required. Tablet uses the desktop layout.

## Elements

| Element | Content | Shape / cue besides color |
| --- | --- | --- |
| Hero HP | Bar + number `82/120` | Bar with a heart-shaped end cap. Ghost segment (`hud-loss`) drains after `hpGhostDelay`. Below 30%: bar edge pulses 1 Hz and icon outline thickens. |
| Core HP | Bar + number | Diamond end cap (same as Core silhouette). Violet frame flash on Core-targeted attack. |
| XP bar | Thin bar, level number | Full width of the top edge, 4 px tall, gilt `hud-xp`. Level badge "Lv 7". |
| Wave counter | `Wave 7 / 20` | Text. Mini-boss waves show a crown glyph, wave 20 a blot glyph. |
| Timer | Run time `12:34` | Tabular numerals. During prep it shows the prep countdown instead (see prep.md). |
| Resources | Wood, stone | Square icon (wood), triangle icon (stone), same shapes as pickups. `+N` floats briefly on gain. Burning count when > 0. |
| Score | Current score | Tabular numerals; updates at most 4×/s. |
| Boss bar | Name + HP + phase pips | Only on waves with a mini-boss/boss. Top center below wave counter. |
| Pause | Icon button | 44×44, top right. |
| Edge arrows | Core threat, spawn sides | See readability §5. |

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
|============================== XP bar (4px, full width) ======================| y=0
| Lv 7                                                                         |
| [♥ Hero HP ███████░░ 82/120]      Wave 7/20  ·  12:34        Score 1,240  [II]|  y=12, row 40px
| [◆ Core HP █████████ 400/400]     [ Varkul  ████████░░  ●●○ ]              |  boss bar, only boss waves
| [■ 34  ▲ 12  🔥2]                                                             |
|                                                                              |
|                              (stage)                                         |
|                                                                              |
|                                                                              |
+------------------------------------------------------------------------------+
```

- Left cluster: x=16, y=12, width 280. Hero HP bar 240×14, Core HP bar 240×10, resources row below.
- Center: wave + timer, `size-lg`, `font-family-text` semibold. Boss bar 480×12, centered, y=56.
- Right: score `size-lg`, pause button 44×44 at x=1220.
- Bottom 50% of the screen holds no HUD.

## Layout: mobile 390×844 portrait

```
+-------------------------------+
|======= XP bar (4px) ==========|  safe-area top
| Lv7  Wave 7/20  12:34    [II] |  row 44
| ♥ █████████░ 82   ◆ ███████ 400|  two bars side by side, 170 each
| ■34 ▲12 🔥2          1,240    |  resources left, score right
|  [ Varkul ████████░ ●●○ ]     |  boss only
|                               |
|           (hero at 38%)       |
|                               |
|                               |
|        (no HUD here)          |
|      joystick floats here     |
|                               |
+-------------------------------+
```

- All HUD in the top 168 px (plus safe area). Nothing in the bottom 200 px.
- HP numbers show current only on mobile (`82`), max on desktop (`82/120`).

## States

| State | Behaviour |
| --- | --- |
| Wave | Full HUD. |
| Prep | Timer becomes prep countdown, prep UI takes over the bottom (prep.md). |
| Hero low HP (< 30%) | Hero bar pulses, screen edges get a 24 px vignette in `hud-hp-hero` at 25% alpha. |
| Core under attack | Core bar frame flashes `stage-core-threat`, edge arrow if off-screen. |
| Core low (< 30%) | Core bar pulses. |
| Level up | XP bar fills and flashes gilt, then card draft opens. |
| Paused | HUD stays visible under the scrim. |

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| "Wave 7/20" | FLEX | TH "เวฟ 7/20". Reserve 120 px; may push timer, never wraps. |
| "Lv" | FLEX | TH "เลเวล" is wider; badge grows. |
| Numbers, icons | FIXED | Tabular numerals. |
| Boss name | FLEX | Truncate is **not** allowed; reduce to `size-sm` if it exceeds 360 px on mobile. |

The HUD uses icons over words wherever possible, so length differences are small.

## Acceptance criteria

- [ ] AC-H1 All seven required readouts (hero HP, Core HP, XP, wave, timer, resources, score) visible at both viewports, both languages.
- [ ] AC-H2 On 390×844, no HUD element below y=644 (bottom 200 px) during waves.
- [ ] AC-H3 Hero HP and Core HP are distinguishable in grayscale (end cap shapes, position).
- [ ] AC-H4 HUD text on plates ≥ 4.5:1 against the plate.
- [ ] AC-H5 Timer and score do not shift horizontally as digits change (tabular numerals).
- [ ] AC-H6 HUD React re-renders at most 10×/s during a 300-enemy wave (React Profiler).
- [ ] AC-H7 Pause button 44×44, Esc/P opens pause.
- [ ] AC-H8 Core-targeted attack flashes the Core bar frame; off-screen shows the edge arrow.
- [ ] AC-H9 Safe-area insets respected in landscape and on notched phones.
- [ ] testids: `hud-hero-hp`, `hud-core-hp`, `hud-xp`, `hud-level`, `hud-wave`, `hud-timer`, `hud-wood`, `hud-stone`, `hud-score`, `hud-pause`, `hud-boss`.
