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
| Menu | | | | | | | | |
| HUD | | | | | | | | |
| Card draft | | | | | | | | |
| Prep | | | | | | | | |
| Pause / settings | | | | | | | | |
| Results | | | | | | | | |

### P1-09 Placeholder art + VFX

| Date | Commit | Grayscale | CVD emulation | 500-enemy frame | Mobile thumb test | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |
