# Prep phase

25 s between waves (PHASE1). The player reads the next wave's intel, builds or upgrades around the
Core, places AI heroes, and can call the wave early for speed score. This is the "plan before you
act" pillar (GDD §1), so intel must be the first thing the eye lands on.

The stage stays live and visible (camera eases to frame the Core and build grid; grid and slots
become visible). The hero can still move during prep.

## Regions

1. **Prep bar** (top): "Prep" label, countdown `0:25` (large, tabular), **Call wave early** button
   with the bonus hint ("Faster = higher speed multiplier", `prep.callEarly.hint`).
2. **Wave intel** card: "Next: Wave 8". A row per enemy type: silhouette icon (same shape as
   in-stage), name, count, and a counter hint as a Charm margin note (e.g. "burns wood"). Plus a
   **compass** (mini map of the arena, Core in center) with arrows on each spawn side, arrow
   thickness = share of the wave. Same chevrons appear at wave start (readability §5).
3. **Build menu**: tabs or segmented control **Wood | Stone**; items: wood wall, stone wall, archer
   tower (wood/stone variant), fire-pit trap. Each item: icon, name, cost (wood/stone icons + numbers),
   upkeep per wave, and a key fact (Wood: "Burns" with flame icon; Stone: "Fireproof" with shield).
4. **Slots + upkeep summary**: "Slots 6/10", "Upkeep next wave: ■ 8 ▲ 4" and current stock. If
   stock < upkeep, the summary turns `semantic-warning` with icon and text "Not enough for upkeep:
   structures will decay" (`prep.upkeep.short`).
5. **Heroes**: two AI hero chips (portrait shape + star pips + personality word). Drag/tap to place.

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
| HUD top row (hero HP, Core HP, resources, score) stays                        |
|------------------------------------------------------------------------------|
| +--Intel (left, 320w)--------+         stage with grid         +--Build (right, 320w)-+
| | Next: Wave 8               |                                 | [ Wood | Stone ]     |
| |  ▲ Raider        ×40       |        ·  ·  ·  ·  ·            | ▣ Wood wall  ■5  ↻1 |
| |  ▲• Torch-bearer ×12       |        ·  [Core] ·              |   Burns 🔥           |
| |     ✎ burns wood           |        ·  ·  ·  ·  ·            | ▣ Archer tower ■8 ↻2|
| |  ⬡ Brute          ×2       |                                 | ◌ Fire pit   ■4 ▲2 |
| |  compass:   ↓↓ N           |                                 |----------------------|
| |          →  ◆  ←← E        |                                 | Slots 6/10           |
| |             ↑   S          |                                 | Upkeep ■8 ▲4         |
| +----------------------------+                                 | Heroes [1★][2★]      |
|                                                                 +----------------------+
|         [  Prep 0:25   ]   [ Call wave early ]   (bottom center bar, 56 tall)        |
+------------------------------------------------------------------------------+
```

## Layout: mobile 390×844

```
+-------------------------------+
| HUD (compact, top 120)        |
| Prep 0:25        [Call early] |  prep bar, 48
|-------------------------------|
| Intel strip (collapsible)     |  height 140: compass 96×96 left,
|  ◆ compass | ▲×40 ▲•×12 ⬡×2   |  enemy chips right (icon + count), tap → names + notes
|-------------------------------|
|                               |
|        stage + grid           |  tap a free slot to open build sheet
|                               |
|-------------------------------|
| Build sheet (bottom, 260)     |  [Wood | Stone] segmented, items in a
| [Wood|Stone]  Slots 6/10      |  horizontal scroll row of 96×120 tiles,
| [▣][▣][◌] →                   |  upkeep line below
| Upkeep ■8 ▲4                  |  safe area bottom
+-------------------------------+
```

Mobile build flow: **tap slot → sheet shows items allowed there → tap item → confirm** (the tile
shows a ghost on the slot first). Desktop: select item, then click a slot; right click / Esc cancels;
hotkeys 1–4 pick items, Tab switches Wood/Stone.

## States

| State | Behaviour |
| --- | --- |
| Enter prep | Intel card slides in from the left margin (`motion-duration-slow`), countdown starts. |
| Last 5 s | Countdown turns `semantic-warning`, ticks each second (scale 1.05 then back). |
| Item unaffordable | Tile at 50% opacity, cost number in `semantic-danger`, still focusable with tooltip "Need ■3 more". |
| No free slot | Items disabled; slots line shows `semantic-warning` "No free slots". |
| Ghost placement | Valid: dashed `stage-slot-free`. Invalid: `stage-slot-blocked` with an × glyph. |
| Burning structures from last wave | Listed in summary with "Repair" action (cost shown). |
| Call wave early | One tap, no confirm (it is reversible only by playing); button shows "+speed" hint. Keyboard: Space. |
| Mini-boss / boss next | Intel header shows crown or blot glyph and the boss name; one Charm line from the Author. |

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Enemy names in intel | FLEX | Wrap to 2 lines in the desktop card; on mobile names are in the expanded view only. |
| Counter notes (Charm) | FLEX | 1 line max EN 32 chars; Thai may wrap to 2. |
| Build item names | FLEX | Tile label max 2 lines; "หอธนู" vs "Archer tower". |
| Costs, counts, timer | FIXED | Icons + tabular numerals. |
| Call wave early | FLEX | TH "เรียกเวฟทันที"; button grows; on mobile max 160 px then wraps to 2 lines. |
| Wood / Stone segmented | FLEX | Equal-width segments sized to the longer label. |

## Acceptance criteria

- [ ] AC-P1 Countdown shows remaining prep time (default 25 s), tabular, warning style in last 5 s.
- [ ] AC-P2 Intel lists every enemy type in the next wave with icon (same shape as in-stage), count, and spawn directions on the compass.
- [ ] AC-P3 Wood and stone options are both visible/one tap away; each shows cost, upkeep and its fire behaviour (Burns / Fireproof) with an icon.
- [ ] AC-P4 Slots used/total and next-wave upkeep are always visible; shortage shows a warning with text.
- [ ] AC-P5 Call wave early works by tap/click and Space and starts the wave immediately.
- [ ] AC-P6 Mobile: tap slot → item → confirm; never builds on a single accidental tap.
- [ ] AC-P7 Unaffordable items explain why (amount missing).
- [ ] AC-P8 All prep UI fits 390×844 with the Core visible between the intel strip and build sheet.
- [ ] testids: `prep-timer`, `prep-call-early`, `intel-enemy-<id>`, `intel-compass`, `build-tab-wood`, `build-tab-stone`, `build-item-<id>`, `build-slots`, `build-upkeep`, `prep-hero-<id>`.
