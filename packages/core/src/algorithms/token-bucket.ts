import type { Decision, RateLimiter } from "../types";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface TokenBucketOptions {
  capacity: number;
  refillPerSec: number;
  now?: () => number; // injectable clock, makes tests deterministic
}

export class TokenBucket implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  private now: () => number;
  private timer: NodeJS.Timeout;

  constructor(private opts: TokenBucketOptions) {
    this.now = opts.now ?? Date.now;
    // memory cleanup: drop buckets that have been idle long enough to be full
    this.timer = setInterval(() => this.sweep(), 30_000);
    this.timer.unref();
  }

  async consume(key: string, cost = 1): Promise<Decision> {
    const { capacity, refillPerSec } = this.opts;
    const now = this.now();

    const b = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };

    // 1. lazy refill
    const elapsedSec = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
    b.updatedAt = now;

    // 2. spend or reject
    let allowed = false;
    let retryAfterMs = 0;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      allowed = true;
    } else {
      retryAfterMs = Math.ceil(((cost - b.tokens) / refillPerSec) * 1000);
    }

    this.buckets.set(key, b);

    return {
      allowed,
      limit: capacity,
      remaining: Math.floor(b.tokens),
      retryAfterMs,
      resetMs: Math.ceil(((capacity - b.tokens) / refillPerSec) * 1000),
    };
  }

  private sweep() {
    const { capacity, refillPerSec } = this.opts;
    const idleMs = (capacity / refillPerSec) * 1000 * 2;
    const cutoff = this.now() - idleMs;
    for (const [k, b] of this.buckets) if (b.updatedAt < cutoff) this.buckets.delete(k);
  }
}