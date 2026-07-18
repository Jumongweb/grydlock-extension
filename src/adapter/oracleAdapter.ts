import { DEFAULT_GET_SCORE_TIMEOUT_MS } from './config';

/**
 * Simple in-memory LRU cache with TTL for score values.
 */
class ScoreCache {
  private maxSize: number;
  private ttlMs: number;
  private map: Map<string, { value: number; expiresAt: number }>;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key: string): number | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      // expired – remove
      this.map.delete(key);
      return undefined;
    }
    // Refresh LRU order by deleting and re-adding
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: number): void {
    // Remove existing to refresh order
    if (this.map.has(key)) this.map.delete(key);
    // Evict oldest if over capacity
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    const expiresAt = Date.now() + this.ttlMs;
    this.map.set(key, { value, expiresAt });
  }
}

// Default cache configuration
const DEFAULT_TTL_MS = 180_000; // 3 minutes
const DEFAULT_MAX_CACHE_SIZE = 100;

/** Global cache instance used by getScore */
const scoreCache = new ScoreCache(DEFAULT_MAX_CACHE_SIZE, DEFAULT_TTL_MS);

/**
 * Core score fetching logic (stub). Extracted for testing and cache usage.
 */
export async function fetchScore(destination: string): Promise<number> {
  // Simulate async work (the existing stub delay).
  await new Promise((resolve) => setTimeout(resolve, 150));
  return stubScoreFor(destination);
}

/**
 * Retrieves a risk score for a destination with a configurable timeout.
 * If the operation exceeds the timeout, it resolves with a fallback score of -1.
 * Supports in‑memory caching with optional bypass.
 *
 * @param destination The destination address to score.
 * @param options Optional configuration:
 *   - timeoutMs overrides the default timeout,
 *   - signal allows external cancellation,
 *   - bypassCache forces a fresh fetch ignoring cached values.
 */
export async function getScore(
  destination: string,
  options?: { timeoutMs?: number; signal?: AbortSignal; bypassCache?: boolean }
): Promise<number> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_GET_SCORE_TIMEOUT_MS;
  const signal = options?.signal ?? new AbortController().signal;
  const bypassCache = options?.bypassCache ?? false;

  if (!bypassCache) {
    const cached = scoreCache.get(destination);
    if (cached !== undefined) return cached;
  }

  const controller = new AbortController();
  const combinedSignal = options?.signal ?? controller.signal;

  // Timeout handling
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error('Timeout'));
    }, timeoutMs);
    combinedSignal.addEventListener('abort', () => clearTimeout(id));
  });

  const scorePromise = fetchScore(destination);

  try {
    const result = await Promise.race([scorePromise, timeoutPromise]);
    // Cache successful result (including -1 fallback may be cached as well)
    scoreCache.set(destination, result as number);
    return result as number;
  } catch (e) {
    console.warn('getScore timeout for destination', destination);
    // Do not cache the fallback value; return -1 directly
    return -1;
  }
}

function stubScoreFor(destination: string): number {
  let hash = 0;
  for (let i = 0; i < destination.length; i++) {
    hash = (hash * 31 + destination.charCodeAt(i)) >>> 0;
  }
  return hash % 101;
}
