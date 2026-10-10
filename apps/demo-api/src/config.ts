const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

const store = process.env.RATE_STORE ?? "memory";
const failMode = process.env.FAIL_MODE ?? "fail-open";
if (store !== "memory" && store !== "redis") throw new Error(`RATE_STORE must be memory|redis, got "${store}"`);
if (failMode !== "fail-open" && failMode !== "fail-closed") throw new Error(`FAIL_MODE must be fail-open|fail-closed`);

export const config = {
  port: num(process.env.PORT, 3000),
  limiterEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  limit: num(process.env.RATE_LIMIT, 100),
  window: process.env.RATE_WINDOW ?? "1s",
  store: store as "memory" | "redis",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  failMode: failMode as "fail-open" | "fail-closed",
};