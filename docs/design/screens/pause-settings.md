# Pause and settings

Pause opens over the stage (sim paused, stage visible under `semantic-scrim`). Settings is the same
panel reachable from the menu (no stage behind; `semantic-bg`).

## Pause content

- Heading "Paused" (Trirong 600, `size-2xl`).
- Run summary line: Wave 7/20, time, score (text-muted).
- Actions (vertical list, in this order): **Resume** (primary, rubric), **Settings**, **Restart run**,
  **Quit to menu**. Restart and Quit ask for confirmation (destructive: the run is lost).

## Settings content

| Group | Setting | Control | Default |
| --- | --- | --- | --- |
| Language | ไทย / English | Segmented (endonyms) | from browser |
| Display | Damage numbers | All / Important / Off | Important |
| Display | Screen shake | On / Off | On |
| Display | Reduce motion | Follow system / On / Off | Follow system |
| Display | Enemy outline weight | Normal / Thick | Normal |
| Controls (touch) | Joystick side | Floating / Left / Right | Floating |
| Controls (touch) | Joystick size | S / M / L (112 / 128 / 152) | M |
| Audio | Master, SFX | Slider 0–100, step 10 | 80 |

All settings apply immediately and persist (localStorage `them.settings`). No Save button.

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
| scrim                                                                        |
|        +--------------------------------------------------+                  |
|        | Paused                     Wave 7/20 · 12:34      |  panel 640×520   |
|        |--------------------+-----------------------------|  radius-lg       |
|        | [ Resume ]         |  Settings (right pane)      |                  |
|        |   Settings  ●      |  Language  [ไทย|English]    |                  |
|        |   Restart run      |  Damage numbers [All|Imp|Off]|                 |
|        |   Quit to menu     |  Screen shake   [On|Off]    |                  |
|        |                    |  ...                         |                 |
|        +--------------------+-----------------------------+                  |
+------------------------------------------------------------------------------+
```

Left column 200 px (actions, the "margin"), right pane shows settings when Settings is selected,
otherwise the run summary.

## Layout: mobile 390×844

```
+-------------------------------+
| Paused            [ × ]       |  full-screen sheet, header 56
| Wave 7/20 · 12:34 · 1,240     |
|-------------------------------|
| [         Resume          ]   |  56 tall
| [        Settings  >      ]   |  pushes a settings page (back arrow)
| [       Restart run       ]   |
| [      Quit to menu       ]   |
|                               |
+-------------------------------+
```

Settings on mobile is a pushed page with grouped rows; each row 56 tall, label left, control right
(or below when the label wraps).

## States and interactions

- Open: Esc / P / pause button. Close: Esc, Resume, × . Focus starts on Resume; focus is trapped.
- Resume shows a 3-2-1 countdown (`size-5xl`, 1 s each) before the sim continues, so players are not
  hit on unpause. Skippable by setting? No, fixed for fairness on all devices.
- Confirm dialog (Restart / Quit): "Leave this run? Progress in this run is lost." with **Keep
  playing** (primary) and **Quit run** (danger outline). Default focus on Keep playing.
- Losing window focus or `visibilitychange` to hidden pauses automatically during waves.

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Action labels | FLEX | Full-width buttons on mobile; desktop column 200 px, wrap to 2 lines allowed. |
| Setting labels | FLEX | On mobile, if label + control > 342 px, control drops below the label. |
| Segmented options | FLEX | Equal width = widest option; if the group exceeds the pane, switch to a select. |

## Acceptance criteria

- [ ] AC-S1 Pause opens via Esc, P and the HUD button; sim time does not advance while open.
- [ ] AC-S2 Resume runs a 3 s countdown before input applies.
- [ ] AC-S3 Restart and Quit require confirmation with Keep playing focused by default.
- [ ] AC-S4 Every setting applies immediately, persists across reload, and the language change re-renders the HUD and pause in place.
- [ ] AC-S5 Focus is trapped in the panel and visible; Esc closes the topmost layer only.
- [ ] AC-S6 Tab hidden during a wave auto-pauses.
- [ ] AC-S7 Both viewports and both languages, no clipping.
- [ ] testids: `pause-resume`, `pause-settings`, `pause-restart`, `pause-quit`, `confirm-keep`, `confirm-quit`, `setting-<key>`.
