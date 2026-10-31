/**
 * QA gate: every id referenced by content resolves in its registry / table, and ids are unique.
 * Data-driven: grows automatically with P1-06 / P1-07 content.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../packages/content/src/index';
import {
  bossScripts, buildingBehaviors, cardEffects, createRun, enemyBehaviors, personalities,
} from '../../packages/core/src/index';

const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

describe('content references (QA gate)', () => {
  it('ids are unique within each content type', () => {
    expect({
      worlds: dupes(content.worlds.map((x) => x.id)),
      enemies: dupes(content.enemies.map((x) => x.id)),
      bosses: dupes(content.bosses.map((x) => x.id)),
      cards: dupes(content.cards.map((x) => x.id)),
      buildings: dupes(content.buildings.map((x) => x.id)),
      heroes: dupes(content.heroes.map((x) => x.id)),
    }).toEqual({ worlds: [], enemies: [], bosses: [], cards: [], buildings: [], heroes: [] });
  });

  it('card effects resolve in cardEffects', () => {
    expect(content.cards.filter((c) => !cardEffects.has(c.effect)).map((c) => `${c.id} → ${c.effect}`)).toEqual([]);
  });

  it('building behaviours resolve in buildingBehaviors', () => {
    expect(content.buildings.filter((b) => !buildingBehaviors.has(b.behavior)).map((b) => `${b.id} → ${b.behavior}`)).toEqual([]);
  });

  it('hero personalities resolve in personalities', () => {
    expect(content.heroes.filter((h) => !personalities.has(h.personality)).map((h) => `${h.id} → ${h.personality}`)).toEqual([]);
  });

  it('boss scripts resolve in bossScripts', () => {
    expect(content.bosses.filter((b) => !bossScripts.has(b.script)).map((b) => `${b.id} → ${b.script}`)).toEqual([]);
  });

  it('enemy behaviours resolve in enemyBehaviors; enemy.boss resolves in bosses', () => {
    const bossIds = new Set(content.bosses.map((b) => b.id));
    const bad: string[] = [];
    for (const e of content.enemies) {
      for (const b of e.behaviors) if (!enemyBehaviors.has(b.id)) bad.push(`${e.id}.behaviors → ${b.id}`);
      if (e.boss && !bossIds.has(e.boss)) bad.push(`${e.id}.boss → ${e.boss}`);
    }
    expect(bad).toEqual([]);
  });

  it('miniboss/boss-tier enemies carry a boss script', () => {
    expect(content.enemies.filter((e) => (e.tier === 'miniboss' || e.tier === 'boss') && !e.boss).map((e) => e.id)).toEqual([]);
  });

  it('every wave group enemy resolves in enemies', () => {
    const ids = new Set(content.enemies.map((e) => e.id));
    const bad: string[] = [];
    for (const w of content.worlds) w.waves.forEach((wave, i) => wave.groups.forEach((g, k) => {
      if (!ids.has(g.enemy)) bad.push(`${w.id}.waves[${i}].groups[${k}] → ${g.enemy}`);
    }));
    expect(bad).toEqual([]);
  });

  it('build-grid masks match their declared size', () => {
    const bad = content.worlds.filter((w) => w.buildGrid.mask.length !== w.buildGrid.rows
      || w.buildGrid.mask.some((r) => r.length !== w.buildGrid.cols)).map((w) => w.id);
    expect(bad).toEqual([]);
  });

  it('createRun accepts every world with every AI hero', () => {
    for (const w of content.worlds) {
      expect(() => createRun({ worldId: w.id, allyHeroes: content.heroes.map((h) => h.id) }, content, 1)).not.toThrow();
    }
  });
});
