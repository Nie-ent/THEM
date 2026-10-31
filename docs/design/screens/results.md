# Results

Shown on victory (Varkul defeated) or defeat (hero died or Core destroyed). This is a premium
screen: the Archive records the run as an entry. One loud thing: the grade letter, stamped.

## Content (GDD §12)

Score = (kill points + boss bonus) × M_difficulty × M_speed × M_damage.

| Line | Shows | Example |
| --- | --- | --- |
| Kill points | Regular ×1, elite ×5, mini-boss ×100, each as count × value = subtotal | 1,600×1 + 40×5 + 3×100 = 2,100 |
| Boss bonus | 500 if Varkul defeated, else "—" | 500 |
| Base | Sum | 2,600 |
| × Difficulty | 1.0 (Normal) | ×1.00 |
| × Speed | standard time ÷ actual time, range 0.7–1.3, with both times shown | ×1.15 (24:00 / 20:52) |
| × Damage | (0.7 + 0.3 × Core HP left) × (1.2 − 0.4 × hero damage share), both inputs shown | ×1.05 |
| **Score** | Product, rounded | **3,140** |
| Grade | From Speed × Damage: S ≥ 1.40, A 1.15–1.39, B 0.90–1.14, C < 0.90 | A (1.21) |
| Reward | 120 / 100 / 80 / 60 % | 100% |

The grade line shows the value it came from (`Speed × Damage = 1.21`) and the next threshold
("S at 1.40"), so the player learns what to improve. Values come from the sim; the UI does no math
except formatting.

Also: outcome heading (Victory: "The world holds." / Defeat: "The page was torn." keys
`results.victory.title` / `results.defeat.title`), waves cleared `14/20`, time, a single Charm
line from the Author (boss's last words on victory), and actions **Play again** (primary) and
**Menu**.

## Layout: desktop 1280×720

```
+------------------------------------------------------------------------------+
| margin 200         | Archive entry, text block x=264                          |
|                    |                                                         |
| Folio · World 1    |  The world holds.               (Trirong 800, 49)        |
| Wave 20/20         |  ✎ "It was written that I fall here."   (Charm)          |
| 20:52              |                                                         |
|                    |  Kill points 1,600×1  40×5  3×100     2,100  |  +-------+ |
|                    |  Boss bonus                                 500   |  |       | |
|                    |  ─────────────────────────────────────────────    |  |   A   | | grade stamp
|                    |  Base                                     2,600   |  |       | | 200×200
|                    |  × Difficulty  Normal                      1.00   |  +-------+ |
|                    |  × Speed       24:00 / 20:52               1.15   |  1.21 · S at 1.40
|                    |  × Damage      Core 100% · hit 38%         1.05   |  Reward 100%
|                    |  ═════════════════════════════════════════════    |            |
|                    |  Score                                    3,140   |            |
|                    |                                                   |            |
|                    |  [ Play again ]   Menu                            |            |
+------------------------------------------------------------------------------+
```

Breakdown table: 560 px wide, numbers right-aligned tabular, labels left. Ruled lines like a ledger
(1 px `semantic-border`, double rule above Score).

## Layout: mobile 390×844

```
+-------------------------------+
| World 1 · 20:52 · 20/20       |  margin band
|-------------------------------|
| The world holds.              |
| ✎ "It was written…"           |
|        +-------+              |
|        |   A   |  160×160     |  grade stamp centered (the one centered element)
|        +-------+              |
|  1.21 · S at 1.40 · 100%      |
|-------------------------------|
| Kill points           2,100 > |  tap to expand the counts
| Boss bonus              500   |
| Base                  2,600   |
| × Difficulty           1.00   |
| × Speed                1.15   |
| × Damage               1.05   |
| Score                 3,140   |
|-------------------------------|
| [       Play again       ]    |  sticky bottom, 56
| [          Menu          ]    |
+-------------------------------+
```

Breakdown scrolls if needed; actions stay sticky at the bottom.

## States

| State | Behaviour |
| --- | --- |
| Victory | Grade in its grade color (`grade-S` gilt for S, vellum for A, etc.); boss quote. |
| Defeat | Heading in `semantic-text`; cause line ("Core destroyed on wave 14" / "Hero fell on wave 9"); boss bonus "—"; grade still shown; reward line notes partial reward (GDD §3). |
| Reveal | The one ceremony: lines fill top to bottom (60 ms each), then the grade stamps in (scale 1.2 → 1, `motion-duration-ceremony`). Any key/tap skips to the final state. Reduced motion: no stamp, fade. |
| New best | Small gilt "New best" mark next to Score; best saved to localStorage. |

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Heading and quote | FLEX | 2 lines max on mobile. |
| Breakdown labels | FLEX | Left column grows; numbers column fixed width 96. Thai labels like "× ความเสียหาย" are wider; table must not overflow 342 px on mobile. |
| Grade letter | FIXED | S/A/B/C in both languages. |
| Times, numbers | FIXED | `Intl.NumberFormat`, tabular. |

## Acceptance criteria

- [ ] AC-R1 Breakdown shows kill points (with counts per tier), boss bonus, base, each of the three multipliers with its inputs, and the final score, matching the sim's values exactly.
- [ ] AC-R2 Grade S/A/B/C follows Speed × Damage thresholds from GDD §12, and the value + next threshold are shown.
- [ ] AC-R3 Grade readable without color (letter is always printed, ≥ 76 px desktop / ≥ 61 px mobile).
- [ ] AC-R4 Defeat shows the cause and the wave it happened on.
- [ ] AC-R5 Reveal is skippable by any key/tap; reduced motion respected.
- [ ] AC-R6 Play again restarts World 1; Menu returns to menu; both keyboard reachable, Play again focused.
- [ ] AC-R7 Both viewports and both languages without clipping or table overflow.
- [ ] testids: `results-score`, `results-grade`, `results-line-<kill|boss|base|difficulty|speed|damage>`, `results-play-again`, `results-menu`.
