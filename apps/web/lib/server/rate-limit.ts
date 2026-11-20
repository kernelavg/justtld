type Bucket = { hits: number[] };

const store = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    bucket.hits = bucket.hits.filter((time) => now - time < windowMs);
    if (bucket.hits.length === 0) store.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
};

/**
 * Скользящее окно в памяти процесса. Ключ — IP + бакет (+ маршрут).
 * Для мультиинстансного деплоя заменяется на Redis без изменения вызывающего кода.
 */
export function checkRateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(windowMs);
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => now - time < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    store.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, limit, retryAfterSeconds: 0 };
}

/** Только для тестов: сбросить счётчики. */
export function resetRateLimits(): void {
  store.clear();
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (!result.ok) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}
