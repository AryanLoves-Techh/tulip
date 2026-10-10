import { describe, it, expect, afterAll } from "vitest";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { RedisTokenBucket } from "../src/algorithms/redis-token-bucket";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function redisIsUp() {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  probe.on("error", () => {});
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const up = await redisIsUp();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!up)("RedisTokenBucket (needs Redis on localhost:6379)", () => {
  const prefix = `test:${randomUUID()}:`;
  const clients: Redis[] = [];
  const connect = () => {
    const c = new Redis(REDIS_URL);
    clients.push(c);
    return c;
  };
  const mk = (o: { capacity?: number; refillPerSec?: number } = {}) =>
    new RedisTokenBucket(connect(), { capacity: 100, refillPerSec: 100 / 3600, prefix, ...o });

  afterAll(async () => {
    const admin = connect();
    const keys = await admin.keys(`${prefix}*`);
    if (keys.length) await admin.del(...keys);
    clients.forEach((c) => c.disconnect());
  });

  it("3 nodes share ONE limit: exactly 100 of 300 allowed, not 100+100+100", async () => {
    const nodes = [mk(), mk(), mk()]; // three separate Redis connections = three API servers
    const results = await Promise.all(
      Array.from({ length: 300 }, (_, i) => nodes[i % 3].consume("client-a")),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(100);
    expect(results.filter((r) => !r.allowed)).toHaveLength(200);
  });

  it("rejection reports a sane retryAfter", async () => {
    const tb = mk({ capacity: 1, refillPerSec: 1 });
    expect((await tb.consume("retry")).allowed).toBe(true);
    const r = await tb.consume("retry");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it("refills over time", async () => {
    const tb = mk({ capacity: 2, refillPerSec: 5 });
    expect((await tb.consume("refill")).allowed).toBe(true);
    expect((await tb.consume("refill")).allowed).toBe(true);
    expect((await tb.consume("refill")).allowed).toBe(false);
    await sleep(400); // ~2 tokens back
    expect((await tb.consume("refill")).allowed).toBe(true);
  });

  it("sets a TTL so idle keys clean themselves up", async () => {
    const tb = mk();
    await tb.consume("ttl");
    const pttl = await clients[0].pttl(`${prefix}tb:ttl`);
    expect(pttl).toBeGreaterThan(0);
  });
});