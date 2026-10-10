import express from "express";
import { rateLimit } from "@ratelimit-guard/express";
import { registry, decisions, httpDuration, limiterErrors, NODE_ID } from "@ratelimit-guard/metrics";
import { botsRouter } from "./routes/bots";
import { config } from "./config";

const app = express();
app.use(express.json());

// tag every response with the node that served it (used by the demo script)
app.use((_req, res, next) => {
  res.setHeader("X-Node-Id", NODE_ID);
  next();
});

let limiterEnabled = config.limiterEnabled;

// timing middleware: records every request, including 429s and 5xx
app.use((req, res, next) => {
  if (req.path === "/metrics") return next();
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    end({
      method: req.method,
      route: req.baseUrl + (req.route?.path ?? "") || "unmatched",
      status_code: String(res.statusCode),
      node: NODE_ID,
    });
  });
  next();
});

const limiter = rateLimit({
  algorithm: "token-bucket",
  limit: config.limit,
  window: config.window,
  store: config.store,
  redisUrl: config.redisUrl,
  failMode: config.failMode,
  keyGenerator: (req) => String(req.headers["x-client-id"] ?? req.ip),
  onDecision: ({ key, decision }) =>
    decisions.inc({ decision: decision.allowed ? "allowed" : "rejected", client: key, node: NODE_ID }),
  onLimiterError: () => limiterErrors.inc({ mode: config.failMode, node: NODE_ID }),
});

app.use((req, res, next) =>
  limiterEnabled && req.path.startsWith("/bots") ? limiter(req, res, next) : next(),
);

app.post("/admin/limiter", (req, res) => {
  limiterEnabled = Boolean(req.body?.enabled);
  res.json({ limiterEnabled });
});

app.use("/bots", botsRouter);

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () =>
  console.log(
    `[${NODE_ID}] :${config.port} | limiter ${limiterEnabled ? "ON" : "OFF"} | store=${config.store} | ` +
      `${config.limit}/${config.window} | ${config.failMode}`,
  ),
);