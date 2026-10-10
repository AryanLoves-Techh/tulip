// Simulates a DB with a small pool: latency grows with concurrency, and
// past the pool size it errors. This is what makes the "before" dramatic.
let inflight = 0;
const MAX_INFLIGHT = 80;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function dbCall<T>(fn: () => T): Promise<T> {
  if (inflight >= MAX_INFLIGHT) throw new Error("connection pool exhausted");
  inflight++;
  try {
    await sleep(20 + inflight * 5);
    return fn();
  } finally {
    inflight--;
  }
}