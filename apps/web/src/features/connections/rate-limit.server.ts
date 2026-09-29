export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

type RateLimiterOptions = {
  max: number
  windowMs: number
  now?: () => number
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

export function createRateLimiter(options: RateLimiterOptions) {
  const buckets = new Map<string, RateLimitBucket>()
  const now = options.now ?? Date.now

  return {
    take(key: string): RateLimitResult {
      const current = now()

      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= current) {
          buckets.delete(bucketKey)
        }
      }

      const bucket = buckets.get(key)

      if (!bucket) {
        const resetAt = current + options.windowMs
        buckets.set(key, { count: 1, resetAt })
        return {
          allowed: true,
          limit: options.max,
          remaining: Math.max(options.max - 1, 0),
          resetAt,
        }
      }

      if (bucket.count >= options.max) {
        return {
          allowed: false,
          limit: options.max,
          remaining: 0,
          resetAt: bucket.resetAt,
        }
      }

      bucket.count += 1
      return {
        allowed: true,
        limit: options.max,
        remaining: Math.max(options.max - bucket.count, 0),
        resetAt: bucket.resetAt,
      }
    },
    clear() {
      buckets.clear()
    },
  }
}

export const redeemIpRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60_000,
})

export const redeemGlobalRateLimiter = createRateLimiter({
  max: 30,
  windowMs: 60_000,
})
