import type { Request, RequestHandler } from "express";
import { createLimiter, type Decision, type LimiterOptions } from "@ratelimit-guard/core";

export type FailMode = "fail-open" | "fail-closed";

export interface RateLimitOptions extends LimiterOptions {
  keyGenerator?: (req: Request) => string;
  onDecision?: (info: { key: string; decision: Decision; req: Request }) => void;
  /** What to do when the limiter itself breaks (e.g. Redis down). Default: fail-open. */
  failMode?: FailMode;
  onLimiterError?: (err: unknown, req: Request) => void;
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const limiter = createLimiter(opts);
  const keyGen = opts.keyGenerator ?? ((req) => req.ip ?? "unknown");
  const failMode = opts.failMode ?? "fail-open";

  return async (req, res, next) => {
    let key: string;
    let d: Decision;

    try {
      key = keyGen(req);
      d = await limiter.consume(key);
    } catch (err) {
      opts.onLimiterError?.(err, req);
      if (failMode === "fail-closed") {
        res.status(503).json({ error: "Rate limiter unavailable" });
        return;
      }
      next(); // fail-open: keep serving traffic without limiting
      return;
    }

    res.setHeader("RateLimit-Limit", d.limit);
    res.setHeader("RateLimit-Remaining", d.remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(d.resetMs / 1000));
    opts.onDecision?.({ key, decision: d, req });

    if (!d.allowed) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil(d.retryAfterMs / 1000)));
      res.status(429).json({ error: "Too Many Requests", retryAfterMs: d.retryAfterMs });
      return;
    }
    next();
  };
}