import "server-only";

/**
 * Reuse one read of a source for a few seconds (decision D6). Several pages and the health check read
 * the same engine and Batteries routes; without this, each page view would repeat every upstream call.
 * Concurrent callers share the in-flight promise. Nothing is persisted: a restart starts empty.
 */
export type TtlCache = {
  get<T>(key: string, load: () => Promise<T>): Promise<T>;
  clear(): void;
  readonly size: number;
};

export function ttlCache(ttlMs: number, now: () => number = Date.now, maxEntries = 500): TtlCache {
  const entries = new Map<string, { readonly expires: number; readonly value: Promise<unknown> }>();
  return {
    get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const at = now();
      const hit = entries.get(key);
      if (hit && hit.expires > at) return hit.value as Promise<T>;
      if (entries.size >= maxEntries) {
        for (const [name, entry] of entries) if (entry.expires <= at) entries.delete(name);
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
      }
      const value = load();
      entries.set(key, { expires: at + ttlMs, value });
      // A rejected load is never reused; readers return Readings, so this only guards against bugs.
      value.catch(() => entries.delete(key));
      return value;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

/** Wrap every method of a reader so its results go through the cache, keyed by name and arguments. */
export function cached<R extends object>(prefix: string, reader: R, cache: TtlCache): R {
  return new Proxy(reader, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver) as unknown;
      if (typeof member !== "function") return member;
      return (...args: unknown[]) =>
        cache.get(`${prefix}.${String(property)}(${JSON.stringify(args)})`, () =>
          (member as (...a: unknown[]) => Promise<unknown>).apply(target, args),
        );
    },
  });
}
