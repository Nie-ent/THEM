/**
 * @them/content — validated game data.
 *
 * `content` is the bundle the game ships with (parsed once at import; throws with a readable zod
 * error if any JSON is invalid). Add a new data file? Import it here and add it to `raw`.
 */
import { z } from 'zod';
import balance from '../data/balance.json' with { type: 'json' };
import bosses from '../data/bosses.json' with { type: 'json' };
import buildings from '../data/buildings.json' with { type: 'json' };
import cards from '../data/cards.json' with { type: 'json' };
import enemies from '../data/enemies.json' with { type: 'json' };
import heroes from '../data/heroes.json' with { type: 'json' };
import meta from '../data/meta.json' with { type: 'json' };
import garroth from '../data/worlds/garroth.json' with { type: 'json' };
import { ContentBundle, type ContentBundleInput } from './schema';

export * from './schema';

export const CONTENT_VERSION = '0.1.0';

/** Raw JSON (unvalidated). Typed as unknown on purpose: zod is the type check for data. */
export const raw: Record<keyof ContentBundleInput, unknown> = {
  version: CONTENT_VERSION,
  balance,
  meta,
  worlds: [garroth],
  enemies,
  bosses,
  cards,
  buildings,
  heroes,
};

/** Validate and apply defaults. Throws an Error listing every problem with its JSON path. */
export function loadContent(input: unknown = raw): ContentBundle {
  const r = ContentBundle.safeParse(input);
  if (!r.success) throw new Error(`Invalid content:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export const content: ContentBundle = loadContent();
