# Camp (meta progression)

P2-09. One screen with six tabs for everything the profile owns between runs: **Character**
(Global Level, stats, class), **Trait Tree** (th: ต้นไม้ทักษะ), **Gear**, **Heroes**, **Summon** (gacha), **Titles**.
Opened from the menu (**Camp** / ค่าย, sentence case, never all-caps, next to Start); Esc / Back returns to the menu. The hub town of
GDD §9 comes later and will host the same panels.

Data and rules come only from `@them/meta` (`apps/game/src/game/profile.ts` → `profileStore`):
the UI never computes a rule, it calls the meta function and shows the result or the
`MetaError` code as text (`ui.camp.error.<code>`). Every change is saved immediately.

One loud thing per tab (R2.4): Character = the level number; Summon = the result reveal;
everywhere else nothing is loud.

## Layout: desktop 1280×720

```
+-------------------------------------------------------------------------------+
| ‹ Menu        Camp                       Lv 12 ███████░░ 1,234/3,909   (o) 2,450 gold |  header 64
|-------------------------------------------------------------------------------|
| Character  |                                                                   |
| Trait Tree ●3 |   tab panel (scrolls), content left-aligned, max width 880        |
| Gear       |                                                                   |
| Heroes     |                                                                   |
| Summon     |                                                                   |
| Titles     |                                                                   |
|  rail 200  |                                                                   |
+-------------------------------------------------------------------------------+
```

- Rail = vertical tablist (role `tablist`, arrow keys move, Enter/Space select). A badge shows
  unspent points (stat points on Character, trait points on Trait Tree).
- Header: back, title, Global Level with EXP bar (`hud-xp` fill on `hud-track`, not `surface-sunken`), gold.
- Title is sentence case ("Camp", "ค่าย"): no `uppercase`, no letter-spacing (Thai is never letter-spaced).
- Gold = a gilt circle icon (`GoldIcon`) plus the number and the word "gold"; the diamond glyph is retired.
- The unspent badge is a gilt outline chip. The active tab scrolls into view in the mobile strip.

## Layout: mobile 390×844

```
+-------------------------------+
| ‹  Camp        Lv 12 (o)2,450 |  header 56, safe-area top
| ███████░░░░ 1,234 / 3,909     |
|-------------------------------|
| Character Trees●3 Gear Heroes |  tab strip, scrolls sideways, 48 high
|-------------------------------|
|                               |
|  panel (scrolls vertically)   |
|                               |
|-------------------------------|
| [  primary action, sticky  ]  |  only when the tab has one pending action
+-------------------------------+
```

Targets ≥ 44×44 (R4.4). Lists are single column. The tab strip never wraps; it scrolls.

## Tabs

### Character
- **Level**: number (display 49 / 39 mobile), EXP to next, cap note at Lv 50.
- **Stats** (5 rows: strength, intellect, agility, vitality, command): name, points, what one
  point gives (from content, e.g. "+1% damage"), current total effect, and − / + steppers for a
  pending allocation. Unspent points shown above. **Confirm** spends (sticky on mobile);
  **Reset** is enabled while free (≤ Lv 10), otherwise disabled with the reason.
- **Class**: current class chain (tier 1 → tier 2) with its bonus line. Below Lv 10: a locked
  note "Choose a class at Lv 10". At Lv 10 with no class, and at Lv 35 with a tier-1 class,
  the choices appear as cards (name, description). Picking asks for confirmation; a change that
  costs a Class Seal says so on the button.

### Trait Tree
- Naming (owner decision N6): th "ต้นไม้ทักษะ" everywhere (points "แต้มทักษะ", nodes "ทักษะ"); branches are "สาย…"
  (สายทัพหน้า, สายจอมเวท, สายนักล่า, สายผู้บัญชาการ).
- Under the tab heading one subtitle line (`traits-subtitle`, `ui.camp.traits.subtitle`):
  th "ทักษะถาวร ติดตัวไปทุกด่าน", en "Permanent skills that carry into every run".
- Crystal-spend confirms: both resets (cost > 0) and keystone learn open a dialog (`ConfirmDialog`,
  focus on Cancel, Esc closes only the dialog, testids `camp-confirm-cancel` / `camp-confirm-ok`).
  Reset buttons are disabled with a reason line when crystals are short.
- Phone: branch picker is a 2x2 grid of `aria-pressed` buttons (`traits-branch`, `traits-branch-<id>`), not a scrolling control.
- Points available + reset buttons (full / one branch) with their crystal cost or "free".
- Desktop: four branch columns side by side (220 each); mobile: branch segmented control and one
  column. Each node: name, description, rank `r/max`, cost, and one action **Learn** (or the
  block reason as text: needs N branch points, needs class, keystone limit, maxed).
  Keystones carry a `semantic-danger` edge and the word "Keystone" (meaning not by colour only).
- Below the branches: **Hybrid** nodes (two-branch requirement shown as text) and **Class** nodes.

### Gear
- Three slots (weapon, armour, accessory) as rows: item name, `+N`, its bonus lines.
- Inventory list below; selecting an item opens its detail (inline on desktop, below on mobile):
  bonuses at this level, set name and set bonus progress, **Equip**, and **Enhance**:
  next level, success chance, chance to drop a level on failure, stones + gold cost, a
  "Use protection scroll" checkbox (only when a drop is possible), and the last result
  (success / failed / failed, dropped to +N / failed, protected).

- Enhance risk rules (`gear-risk`, `semantic-warning` text with a warning icon, never colour alone):
  (a) shown whenever a failure can drop the level, naming the target ("On failure: p chance to drop to +N-1");
  (b) the Enhance button label says it risks dropping (protected variant when a scroll is used) when chance < 100% and a drop is possible;
  (c) the protection toggle resets when another item is selected, and is disabled at 0 scrolls with `gear-no-scrolls` (needed count + source);
  (d) a failed-with-drop result is `semantic-danger` text.

### Heroes
- Roster list: name, stars (★ glyphs + number for screen readers), level `L / cap`, EXP bar,
  "In team" toggle (max team size from content, order = order picked).
- Selected hero: growth bonus (HP / damage), **Use Field Manual** ×1 / ×10, **Use War Chronicle**
  ×1, **Star up** (shards + gold), **Limit break** (essence + gold, enabled only at cap).

### Summon
- Banner name and description; the price for 1 and 10 pulls in gold. On phone the order is banner, rates, pulls, pity (rates above the pull buttons); on desktop pulls sit beside rates.
- Column headers: "Single pull" (listed) and "Overall rate (guarantees included)" (effective). Both columns are rounded by largest remainder so each sums to exactly 100.0% (gate `tests/gates/summon-rates.test.ts`). Pity line states "guaranteed at 80".
- **Rates table** (owner decision 2026-11-01: show real rates): the real share per star from
  `effectiveRates()` (pity and the 10-pull guarantee included) as the main column, the per-pull base
  rate as a smaller second column, and a note explaining the difference. Former draft: base rates, and a note that the 10-pull
  guarantee and pity raise the real 4★/5★ share (QA-P2-11-001: show "effective" values too:
  5★ ≈ 2.4%, 4★ ≈ 14.4%, taken from `docs/qa/phase2-sims.md`, keys `ui.camp.summon.effective*`).
- Pity: pulls since the last 5★ (`n / 80`), soft pity note from pull 60, pulls until the next
  guaranteed 4★.
- Buttons **Pull ×1**, **Pull ×10**. The result list (ceremony: cards appear one by one, 80 ms
  apart; reduced motion: fade) shows hero, stars, "New" or "+N shards".

### Unavailable actions (QA-P2-002)
Any action blocked by missing items (books, limit-break items, shards, class seal, stones, scrolls) is
disabled and shows a reason line: "Need N more X" (`ui.camp.short`) or, when no stage drops or
recipe provides the item, "X: no source yet" (`ui.camp.noSource`). Hero x10 books are hidden below 10 owned.

### Titles
- Equipped title at the top with its bonus. Collection: `n titles`, and each tier (3/6/9) with
  its bonus, reached or not.
- List of all titles: name, how to earn (desc), state (locked / unlocked / equipped), **Equip**
  on unlocked ones. Locked titles are shown (so players know the goals), muted.

## Results screen addition (P2-10)
Under the breakdown: **Rewards**: gold, account EXP (and "Level up! Lv N" when it happens), items
(stones, manuals, essence), new titles ("New title: …"). A loss shows the reduced share. testid
`results-rewards`.

## States

| State | Behaviour |
| --- | --- |
| No profile (save from a newer build) | Camp button disabled with "Update the game to use your save" (`ui.camp.newerSave`). |
| Action refused | The meta error text appears under the action (role `status`), nothing changes. |
| Corrupt save replaced | Menu shows `save-notice-corrupt` (readable, touch-safe, dismissable via `save-notice-dismiss`) naming the backup key, or `corruptNoBackup` when the backup write failed. |
| Save from a newer build | Menu shows `save-notice-newer` (not dismissable) next to the disabled Camp button. |
| Saving | Instant; no spinner. A failed write keeps the in-memory profile (existing policy). |
| Empty lists | Gear inventory and roster always have the starting kit; titles list is never empty. |

## i18n

| Element | Flex | Note |
| --- | --- | --- |
| Tab labels | FLEX | Thai labels are short but taller; the mobile strip scrolls rather than wraps. |
| Node / item / title names and descriptions | FLEX | Wrap with `Wrap` (Intl.Segmenter). |
| Numbers, %, costs, ranks, stars | FIXED | `Intl.NumberFormat`, tabular. |
| Bonus lines | FLEX | Built from `ui.mod.<Mods key>` with the formatted value. |

## Acceptance criteria

- [ ] AC-C1 Camp opens from the menu and returns with Back / Esc; every tab reachable by mouse, touch and keyboard.
- [ ] AC-C2 Stat allocation spends exactly the confirmed points; reset follows the free rule; values match `@them/meta`.
- [ ] AC-C3 Class choices appear only at the right levels; a paid change names its cost.
- [ ] AC-C4 Trait nodes show rank, cost and the real block reason; Learn and reset update points at once.
- [ ] AC-C5 Gear equip and enhance follow the meta result (success / fail / drop / protected) and costs.
- [ ] AC-C6 Hero team toggle respects the team size; books, star up, limit break update level/stars/cap.
- [ ] AC-C7 Summon shows base and effective rates, pity counters, spends gold and lists every result.
- [ ] AC-C8 Titles: equip only unlocked; collection tiers shown with reached state.
- [ ] AC-C9 Results show the run's rewards, level-ups and new titles.
- [ ] AC-C10 Both viewports and both languages without clipping (R3), no horizontal page scroll at 390 px.
- [ ] testids: `menu-camp`, `camp`, `camp-back`, `camp-tab-<character|traits|gear|heroes|summon|titles>`,
  `camp-level`, `stat-<id>-plus`, `stat-<id>-minus`, `stats-confirm`, `stats-reset`, `class-pick-<id>`,
  `trait-<id>-learn`, `traits-reset`, `traits-subtitle`, `traits-branch-<id>`, `gear-risk`, `gear-no-scrolls`, `camp-confirm-cancel`, `camp-confirm-ok`, `save-notice-corrupt`, `save-notice-newer`, `save-notice-dismiss`, `gear-item-<uid>`, `gear-equip`, `gear-enhance`, `gear-protect`,
  `hero-<id>`, `hero-team-<id>`, `hero-book-small`, `hero-star-up`, `hero-limit-break`,
  `summon-1`, `summon-10`, `summon-results`, `title-equip-<id>`, `camp-error`, `results-rewards`.
