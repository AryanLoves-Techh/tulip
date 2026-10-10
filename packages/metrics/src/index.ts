import * as client from "prom-client";

export const NODE_ID = process.env.NODE_ID ?? "node-1";
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// one increment per limiter decision
export const decisions = new client.Counter({
  name: "rate_limit_requests_total",
  help: "Rate limiter decisions",
  labelNames: ["decision", "client", "node"],
  registers: [registry],
});

// every HTTP request, labelled by status code
export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status_code", "node"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const limiterErrors = new client.Counter({
  name: "rate_limiter_errors_total",
  help: "Times the limiter itself failed (e.g. Redis unreachable)",
  labelNames: ["mode", "node"],
  registers: [registry],
});