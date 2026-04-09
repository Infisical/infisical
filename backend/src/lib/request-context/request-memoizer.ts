import { requestContext } from "@fastify/request-context";

import { requestContextKeys } from "./request-context-keys";

/**
 * Request-scoped memoization cache.
 *
 * Attached to each Fastify request via @fastify/request-context.
 * Automatically garbage-collected when the request ends — no TTL or
 * invalidation logic required.
 *
 * Use this for read-only data that is fetched multiple times within
 * a single request (e.g. projectDAL.findById, identityDAL.findById).
 */
export class RequestMemoizer {
  private cache = new Map<string, unknown>();

  // Tracks in-flight promises so concurrent calls for the same key
  // coalesce onto a single fetcher execution (e.g. Promise.all in batch ops).
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * Return the cached value for `key`, or call `fetcher`, cache the result, and return it.
   * Concurrent calls for the same key share a single fetcher invocation.
   * If the fetcher throws, nothing is cached and the error propagates.
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fetcher()
      .then((result) => {
        this.cache.set(key, result);
        this.inflight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }
}

/**
 * Memoize an async operation within the current request scope.
 *
 * Falls back to direct execution when no request context is available
 * (e.g. inside queue workers or background jobs).
 *
 * Do NOT use for:
 * - Calls inside a DB transaction (pass `trx`) — the transaction may see
 *   different data than the memoized read-replica result.
 * - Data that is mutated within the same request and re-read afterwards.
 */
export const requestMemoize = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const memoizer = requestContext.get(requestContextKeys.memoizer);
  if (!memoizer) return fetcher();
  return memoizer.getOrSet(key, fetcher);
};
