/**
 * Per-host rate limiter.
 *
 * Enforces the minimum interval between successive HTTP requests to the
 * same origin, per CRAWLING_POLICY:
 *
 *   - Default: 2 seconds between requests to the same origin.
 *   - If robots.txt advertises a Crawl-delay larger than the default,
 *     that larger value wins.
 *   - Crawl-delay smaller than the default is ignored — site operators
 *     cannot make ToraSEO faster, only slower.
 *
 * This is an in-memory limiter, scoped to the lifetime of the MCP server
 * process. Each Claude Desktop launch starts with a clean slate.
 *
 * Concurrency note: we use a per-origin promise chain so that two
 * concurrent calls for the same origin will queue rather than both wait
 * the same delay and then fire simultaneously. Different origins do not
 * block each other.
 */

// --- Constants -----------------------------------------------------------

/** Default minimum interval between requests to the same origin. */
const DEFAULT_MIN_INTERVAL_MS = 2_000;

// --- State ---------------------------------------------------------------

interface OriginState {
  /** Wall-clock time at which the next request to this origin may begin. */
  nextAllowedAt: number;
  /** Promise that resolves when the in-flight or queued wait completes. */
  chain: Promise<void>;
}

const originState = new Map<string, OriginState>();

// --- Public API ----------------------------------------------------------

/**
 * Waits until the calling code is allowed to issue an HTTP request to
 * the given URL's origin. Updates internal state so the NEXT call for
 * the same origin will wait at least `minInterval` ms.
 *
 * @param url           The full URL we are about to request.
 * @param crawlDelayMs  Optional override from robots.txt (in ms).
 *                      Pass `null` if no Crawl-delay was advertised.
 *                      Values smaller than DEFAULT_MIN_INTERVAL_MS are
 *                      ignored — only delays that ASK us to slow down
 *                      are honored.
 */
export async function awaitRateLimit(
  url: string,
  crawlDelayMs: number | null,
): Promise<void> {
  const origin = originFromUrl(url);
  const minInterval = Math.max(
    DEFAULT_MIN_INTERVAL_MS,
    crawlDelayMs ?? 0,
  );

  // Build the wait chain: append our wait after any existing queued waits
  // for this origin. This guarantees serialization per origin without
  // blocking other origins.
  const previous = originState.get(origin);
  const previousChain = previous?.chain ?? Promise.resolve();

  const next = previousChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, (previous?.nextAllowedAt ?? 0) - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    // After this resolves, the caller will make the request. Set the
    // earliest time the *next* caller may proceed.
    const newState = originState.get(origin);
    if (newState !== undefined) {
      newState.nextAllowedAt = Date.now() + minInterval;
    }
  });

  originState.set(origin, {
    nextAllowedAt: previous?.nextAllowedAt ?? 0,
    chain: next,
  });

  await next;
}

// --- Internals -----------------------------------------------------------

function originFromUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Test helpers --------------------------------------------------------

/**
 * Clears all per-origin state. Intended for unit tests only.
 */
export function _resetRateLimiterForTests(): void {
  originState.clear();
}
