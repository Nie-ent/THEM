# Card draft (level-up)

Opens when the hero levels up mid-wave. The sim pauses. Choose 1 of 3 skill cards; 2 rerolls per run.
GDD §3: good cards carry drawbacks, so the drawback must be as visible as the benefit.
This is the screen's one loud moment: three cards laid down like pages.

## Card anatomy (all cards identical structure)

```
+-----------------------------+   card: surface-raised, 1px border, radius-md
| ◇ rarity edge (top 3px)     |   common: border-strong · rare: info · epic: rubric-300 · legendary: gilt-400
| Icon 48   Name (Trirong 600)|   name FLEX, 2 lines max
|           Tag · Tag         |   tags: chips, radius-sm
|-----------------------------|
| + Benefit text              |   text, size-md, line-height body, "+" glyph in success
| + Benefit text              |
|-----------------------------|
| ✎ Drawback (Charm, red)     |   annotation color, hand font, struck-through-style rule above
|   "Max HP −20%"  (text font) |   the number itself is in the text face for legibility
|-----------------------------|
| Level 1 → 2  (if upgrade)   |   text-subtle
| [ 1 ] key hint (desktop)    |
+-----------------------------+
```

- The drawback block is written as the Author's margin note: a short Charm phrase (flavor, optional)
  plus the exact mechanical effect in the text face with a `−` glyph and `semantic-danger` icon.
  Mechanical text is never in Charm.
- Cards without drawbacks show no drawback block (not an empty one).
- Rarity is shown by the top edge **and** a rarity word in the tag row, never by color only.

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
| scrim over stage                                                             |
|   Level 8    Choose one.                     (Trirong 31, left at x=160)     |
|                                                                              |
|   +-----------+     +-----------+     +-----------+                          |
|   |  card 1   |     |  card 2   |     |  card 3   |   each 296×400, gap 32    |
|   |           |     |           |     |           |   group centered          |
|   +-----------+     +-----------+     +-----------+                          |
|                                                                              |
|   Reroll (2 left)  [R]                          (secondary button, left)     |
+------------------------------------------------------------------------------+
```

## Layout: mobile 390×844

```
+-------------------------------+
| Level 8   Choose one.         |  y=safe+24
|-------------------------------|
| +---------------------------+ |  cards stacked vertically, 342 wide,
| | card 1 (compact)          | |  compact: icon + name + benefit + drawback,
| +---------------------------+ |  height content-driven (min 160)
| +---------------------------+ |  vertical scroll if needed; header fixed
| | card 2                    | |
| +---------------------------+ |
| +---------------------------+ |
| | card 3                    | |
| +---------------------------+ |
|                               |
| [ Reroll (2 left) ] [ Take ]  |  bottom bar, 56 tall, safe area bottom
+-------------------------------+
```

Mobile uses **select then confirm**: tap a card to select (gilt 2 px border + check), then Take.
This prevents accidental picks from a thumb that was still holding the joystick when the draft
opened. Desktop: click picks immediately; keys 1/2/3 select and Enter confirms.

## States

| State | Behaviour |
| --- | --- |
| Opening | 400 ms input lock (ignore taps/keys) so a held joystick or key does not pick. Cards deal in left to right, 80 ms stagger, `motion-duration-ceremony` total. |
| Selected (mobile) | Gilt border, others dim to 70% opacity. |
| Hover/focus (desktop) | Card lifts 4 px, border `border-strong` → `focus`. |
| Rerolling | Cards flip out and back with new content (`motion-duration-slow`). Counter decrements. |
| Rerolls exhausted | Reroll button disabled with label "No rerolls left" (`draft.reroll.none`). |
| Multiple level-ups | Header shows "Level 8 (1 more)"; next draft opens right after. |
| Paused from draft | Esc opens pause on top; closing returns to draft. |

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Card name | FLEX | Max 2 lines; Thai wraps on `Intl.Segmenter` words. |
| Benefit / drawback text | FLEX | Card height grows on mobile; on desktop fixed height 400 with internal scroll only as last resort (should not happen with content ≤ 3 lines each). Content authors: keep each line ≤ 60 chars EN. |
| "Choose one." | FLEX | |
| Reroll label | FLEX | Includes count via i18next interpolation `{{count}}` with plural rules. |
| Key hints | FIXED | Hidden on touch devices. |

## Acceptance criteria

- [ ] AC-D1 Exactly 3 cards, identical anatomy, at both viewports and both languages without clipping.
- [ ] AC-D2 Every card with a drawback shows it in its own block with a `−`/icon and the mechanical effect in the text face.
- [ ] AC-D3 Rarity is identifiable without color (word in the tag row).
- [ ] AC-D4 Reroll shows remaining count, decrements, disables at 0, and the count persists across drafts in a run.
- [ ] AC-D5 Input is ignored for 400 ms after opening (test: hold a key/tap through the open).
- [ ] AC-D6 Mobile requires select + Take; desktop supports click, 1/2/3 + Enter, R for reroll.
- [ ] AC-D7 Sim is paused while open (wave timer does not advance).
- [ ] testids: `draft-card-0..2`, `draft-reroll`, `draft-take`, `draft-drawback-<i>`.
