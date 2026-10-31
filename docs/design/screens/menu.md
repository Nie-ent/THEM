# Title / main menu

The first thing a player sees, so it must look premium. One loud thing: the title set as a
manuscript heading. Everything else is quiet.

## Content

- Title "THEM" (Trirong 800, `size-6xl` desktop / `size-5xl` mobile, `color-semantic-text`).
- Subtitle line under the title in Charm (`font-family-hand`, `size-lg`, `color-semantic-annotation`):
  key `menu.epigraph` (e.g. EN "Some worlds were written to fall." / TH equivalent). The only hand text.
- World entry: "World 1, Garroth Bloodfields" (`menu.world1.name`) with a one-line threat summary.
- Primary action: **Start** (`menu.start`), rubric fill button.
- Secondary: **Settings** (`menu.settings`), text button.
- Language toggle: segmented control **ไทย | English** (labels are endonyms, never translated).
- Best result for World 1 if a save exists: grade letter + score (`menu.best`).
- Version string bottom corner (`color-semantic-text-subtle`, `size-xs`).

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
| margin 200px        | text block, left-aligned, starts x=264                 |
|                     |                                                        |
| [ไทย | English]     |  THEM                         (76px Trirong 800)       |
|  top-left, y=40     |  Some worlds were written to fall.   (Charm 20)        |
|                     |                                                        |
|                     |  ─────────────── 1px border, 480px                     |
|  ink blot mark      |  World 1                                               |
|  (only ornament)    |  Garroth Bloodfields   (Trirong 600, 31px)             |
|                     |  Raiders with torches. Wood burns. (text-muted, 16)    |
|                     |  Best: A · 3,140   (only if save)                       |
|                     |                                                        |
|                     |  [ Start ]  (rubric, min 200×48)   Settings            |
|                     |                                                        |
| v0.1.0              |                                                        |
+------------------------------------------------------------------------------+
```

- Margin column 200 px with a 1 px `color-semantic-border` vertical rule at x=200.
- Text block max width 560 px, left edge x=264, vertically centered as a group.

## Layout: mobile 390×844

```
+-------------------------------+
| [ไทย | English]        16px   |  margin band, height 64, safe-area top
|-------------------------------|
|                               |
|  THEM          (61px)         |  x=24
|  Some worlds were written…    |
|                               |
|  World 1                      |
|  Garroth Bloodfields          |
|  Raiders with torches…        |
|  Best: A · 3,140              |
|                               |
|                               |
|  [        Start        ]      |  full width minus 48, height 56, bottom 96
|  [       Settings      ]      |  text button, 48 high
+-------------------------------+
```

Primary actions sit in the bottom third (thumb zone).

## States

| State | Behaviour |
| --- | --- |
| First launch | Language defaults to `navigator.language` starting with `th` → Thai, else English. Best line hidden. |
| Has save | Best line shows grade + score. |
| Fonts loading | System fallback renders immediately (`display=swap`); no layout jump > 4 px (reserve title height). |
| Start pressed | Button shows pressed state (`gilt-600` 1 px inset edge) and the screen fades out over `motion-duration-slow`. |
| Focus | Initial focus on Start. Tab order: language toggle, Start, Settings. |

## Interactions

- Language toggle switches i18next language instantly, re-renders, persists to localStorage
  (`them.lang`), sets `<html lang>` to `th` or `en`. No reload.
- Enter = Start. Esc on the menu does nothing.
- Ceremony moment: on first paint, the title draws in as an ink stroke (clip-path wipe left to
  right, `motion-duration-ceremony`, `motion-easing-ink`). Nothing else animates.

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Title THEM | FIXED | Same in both languages. |
| Epigraph | FLEX | Thai Charm is wider; may wrap to 2 lines on mobile. Max 2 lines. |
| World name | FLEX | "ทุ่งเลือดการ์รอธ" vs "Garroth Bloodfields"; wraps on mobile. |
| Start / Settings | FLEX | Min width, grows with text, never truncates. |
| Language toggle | FIXED | Endonyms, same in both. |

## Acceptance criteria

- [ ] AC-M1 Layout matches the wireframes at 1280×720 and 390×844 in both languages; no clipped text.
- [ ] AC-M2 Toggle switches every string on screen without reload and persists across refresh.
- [ ] AC-M3 `<html lang>` follows the selected language.
- [ ] AC-M4 Start is reachable by Enter and by Tab, with a visible gilt focus ring.
- [ ] AC-M5 Start button ≥ 48 px tall on desktop and ≥ 56 px on mobile, inside the bottom third on mobile.
- [ ] AC-M6 Only one animated element on load; with reduced motion it fades instead.
- [ ] AC-M7 No raw hex or px font sizes in the component (grep).
- [ ] testids: `menu-start`, `menu-settings`, `lang-th`, `lang-en`, `menu-best`.
