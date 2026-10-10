import type { Redis } from "ioredis";
import type { Decision, RateLimiter } from "../types";
import { TOKEN_BUCKET_LUA } from "../storage/lua/scripts";

export interface RedisTokenBucketOptions {
  capacity: number;
  refillPerSec: number;
  prefix?: string;
}

type WithCommand = Redis & {
  rlTokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    cost: number,
  ): Promise<[number, number, number, number]>;
};

export class RedisTokenBucket implements RateLimiter {
  private redis: WithCommand;
  private prefix: string;

  constructor(redis: Redis, private opts: RedisTokenBucketOptions) {
    this.prefix = opts.prefix ?? "rl:";
    if (typeof (redis as Partial<WithCommand>).rlTokenBucket !== "function") {
      // ioredis sends EVALSHA and falls back to EVAL automatically
      redis.defineCommand("rlTokenBucket", { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });
    }
    this.redis = redis as WithCommand;
  }

  async consume(key: string, cost = 1): Promise<Decision> {
    const { capacity, refillPerSec } = this.opts;
    const [allowed, remaining, retryAfterMs, resetMs] = await this.redis.rlTokenBucket(
      `${this.prefix}tb:${key}`,
      capacity,
      refillPerSec,
      cost,
    );
    return { allowed: allowed === 1, limit: capacity, remaining, retryAfterMs, resetMs };
  }
}