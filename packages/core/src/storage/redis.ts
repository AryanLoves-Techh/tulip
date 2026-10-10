import { Redis } from "ioredis";

export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    enableOfflineQueue: false, // fail fast when Redis is down instead of queueing commands
    maxRetriesPerRequest: 1,
    commandTimeout: 250,       // a hung Redis must not hang your API
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  let down = false;
  client.once("ready", () => console.log("[redis] connected"));
  client.on("error", (err) => {
    if (!down) {
      down = true;
      const code = (err as { code?: string }).code;
      console.warn(`[redis] unavailable: ${code ?? err.message}`);
    }
  });
  client.on("ready", () => {
    if (down) console.warn("[redis] recovered");
    down = false;
  });
  return client;
}