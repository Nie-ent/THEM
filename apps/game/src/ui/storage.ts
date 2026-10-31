/** localStorage wrapper: every read/write is guarded (private windows, blocked storage, quota). */
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the app keeps working without persistence */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readStore(key);
  if (raw === null) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}
