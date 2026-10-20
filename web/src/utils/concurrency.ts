/**
 * Map over items with at most `limit` calls in flight, keeping input order.
 * Used for the per-actor engine reads (allowance, cost summary, reconciliation) so a stack with many
 * actors does not fire hundreds of requests at once.
 */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T, index);
    }
  });
  await Promise.all(lanes);
  return results;
}
