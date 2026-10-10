import { TokenBucket } from "./algorithms/token-bucket";
import { RedisTokenBucket } from "./algorithms/redis-token-bucket";
import { createRedisClient } from "./storage/redis";
import { parseWindow } from "./parse-window";
import type { LimiterOptions, RateLimiter } from "./types";

export function createLimiter(o: LimiterOptions): RateLimiter {
  const windowMs = parseWindow(o.window);
  if (!(o.limit > 0) || !(windowMs > 0)) throw new Error("limit and window must be positive");

  const capacity = o.burst ?? o.limit;
  const refillPerSec = o.limit / (windowMs / 1000);

  switch (o.algorithm) {
    case "token-bucket": {
      if (o.store === "redis") {
        const client = o.redis ?? createRedisClient(o.redisUrl ?? "redis://localhost:6379");
        return new RedisTokenBucket(client, { capacity, refillPerSec, prefix: o.keyPrefix });
      }
      return new TokenBucket({ capacity, refillPerSec });
    }
    default:
      throw new Error(`Unknown algorithm: ${o.algorithm}`);
  }
}