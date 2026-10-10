import type { Redis } from "ioredis";

export interface Decision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number; // 0 when allowed
  resetMs: number;      // time until the bucket is full again
}

export interface RateLimiter {
  consume(key: string, cost?: number): Promise<Decision>;
}

export type AlgorithmName = "token-bucket";
export type StoreName = "memory" | "redis";

export interface LimiterOptions {
  algorithm: AlgorithmName;
  limit: number;
  window: string | number;
  burst?: number;
  store?: StoreName;   // default "memory"
  redis?: Redis;       // bring your own client...
  redisUrl?: string;   // ...or a URL (default redis://localhost:6379)
  keyPrefix?: string;  // namespace for Redis keys, default "rl:"
}