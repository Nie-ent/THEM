/** Flattens a nested resource object into dotted keys: { a: { b: 'x' } } -> ['a.b']. */
export function flattenKeys(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') flattenKeys(v, key, out);
      else out.push(key);
    }
  }
  return out;
}
