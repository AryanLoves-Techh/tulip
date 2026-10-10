# RateLimit Guard

Distributed rate-limiting middleware for Node.js. One global limit is enforced across many API servers using **Redis + Lua**, with a live dashboard that shows a struggling backend before the limiter and a healthy one after.

> Same cluster, same Redis, same traffic. Only the limiter flag changes.

## Features

- **Token bucket** limiter with configurable limit, window and burst capacity
- **Express middleware** that returns `429 Too Many Requests` with `Retry-After` and `RateLimit-Limit / Remaining / Reset` headers
- **Distributed limiting**: 3 API nodes share one counter in Redis, so 3 servers allow 100 requests in total, not 300
- **Atomic Lua script** (read, refill, spend, expire in one step) so concurrent nodes can't race each other
- **Redis server clock** (`TIME`) inside the script, so clock drift between nodes can't skew limits
- **Fail-open / fail-closed** option for when Redis is unavailable
- **Per-client keys** (`x-client-id` header, falls back to IP) so one abusive client can't hurt others
- **Prometheus metrics** and a pre-provisioned **Grafana** dashboard
- **Next.js control panel** with a live traffic-flow animation, a limiter on/off switch, traffic scenarios, and a one-click **Before / After** comparison

## Architecture

```
                         Next.js UI :3002
                 (control panel + Before/After page)
                               |
                               v
Clients ──► nginx :8080 ──► api-1 / api-2 / api-3
                               |
                  rateLimit() middleware (token bucket)
                               |
                  one Lua script, atomic ──► Redis
                               |
                       /metrics ──► Prometheus :9090 ──► Grafana :3001
```

`core` knows nothing about Express or Prometheus. The Express wrapper calls an `onDecision` hook, and the demo API plugs Prometheus counters into it.

## Project structure

```
ratelimit-guard/
├── packages/
│   ├── core/       # algorithms, Redis adapter, Lua script, createLimiter()
│   ├── express/    # Express middleware wrapper
│   └── metrics/    # prom-client registry and metrics
├── apps/
│   ├── demo-api/   # deliberately fragile bot CRUD server
│   └── web/        # Next.js dashboard
├── loadtest/       # CLI load scripts
├── docker/         # nginx, Prometheus, Grafana provisioning
├── docker-compose.yml
└── README.md
```

## Quick start

**Requirements:** Node.js, pnpm, Docker Desktop.

```bash
# 1. install dependencies
pnpm install
pnpm approve-builds        # approve esbuild / sharp when pnpm asks

# 2. a per-second limit makes the Before / After demo work best
printf "RATE_LIMIT=100\nRATE_WINDOW=1s\n" > .env

# 3. start Redis, 3 API nodes, nginx, Prometheus and Grafana
docker compose up -d --build
docker compose restart prometheus

# 4. start the UI
pnpm --filter web dev
```

| Service | URL |
|---|---|
| Control panel | http://localhost:3002 |
| Before / After page | http://localhost:3002/compare |
| API gateway (nginx) | http://localhost:8080 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (`admin` / `admin`) |

## Using the middleware

```ts
import express from "express";
import { rateLimit } from "@ratelimit-guard/express";

const app = express();

app.use(
  rateLimit({
    algorithm: "token-bucket",
    limit: 100,
    window: "1m",
    store: "redis",                  // "memory" for a single instance
    redisUrl: "redis://localhost:6379",
    failMode: "fail-open",           // or "fail-closed"
    keyGenerator: (req) => String(req.headers["x-api-key"] ?? req.ip),
  }),
);
```

When the limit is exceeded:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 5
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 5
```

### Options

| Option | Default | Description |
|---|---|---|
| `algorithm` | required | `"token-bucket"` |
| `limit` | required | Requests allowed per `window` |
| `window` | required | `"500ms"`, `"1s"`, `"1m"`, `"1h"`, `"1d"` or milliseconds |
| `burst` | `limit` | Bucket capacity (maximum burst size) |
| `store` | `"memory"` | `"memory"` or `"redis"` |
| `redisUrl` / `redis` | `redis://localhost:6379` | Connection URL or an existing ioredis client |
| `keyPrefix` | `"rl:"` | Namespace for Redis keys |
| `keyGenerator` | `req.ip` | Function that returns the client key |
| `failMode` | `"fail-open"` | Behaviour when the limiter itself fails |
| `onDecision` | none | Hook called with every allow/reject decision |
| `onLimiterError` | none | Hook called when the limiter errors |

## Demo API configuration

The demo API reads these environment variables (set through `docker-compose.yml` and `.env`):

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT` | `100` | Requests per window |
| `RATE_WINDOW` | `1s` (compose default: `1h`) | Window size |
| `RATE_STORE` | `memory` (compose default: `redis`) | `memory` or `redis` |
| `FAIL_MODE` | `fail-open` | `fail-open` or `fail-closed` |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `RATE_LIMIT_ENABLED` | `false` | Initial limiter state (the toggle is stored in Redis) |
| `NODE_ID` | `node-1` | Label shown in metrics and the `X-Node-Id` header |
| `PORT` | `3000` | HTTP port |

> The demo uses a 1 hour window in `docker-compose.yml` by default so the "exactly 100 of 300" burst is precise. Set `RATE_WINDOW=1s` in `.env` for the Before / After page, which needs a per-second limit.

## The demos

### 1. Distributed burst (control panel)

300 requests from one client go through nginx to 3 nodes. With `RATE_WINDOW=1h`, exactly **100** are allowed, not 300. Run it with `RATE_STORE=memory` to see the bug this project fixes: each node keeps its own counter and about 300 get through.

### 2. Abuser vs normal user (control panel)

One client floods the API while another sends polite requests. The abuser is rejected and the normal user is unaffected, because limits are per client.

### 3. Before / After (`/compare`)

One button runs three phases automatically (about 90 seconds):

| Phase | Limiter | Traffic |
|---|---|---|
| Healthy baseline | off | normal user only |
| Flood | **off** | abuser floods, normal user keeps working |
| Flood | **on** | same flood, same normal user |

The page charts the normal user's p95 latency, backend served vs failed requests, and the 429 rate, then summarises the change. The same run is visible in Grafana.

## How it works

**Token bucket.** Each client key owns a bucket holding up to `capacity` tokens that refill continuously. Each request spends one token and is rejected when none is left. Refilling is lazy: tokens are computed from the time since the last request, so no timers run per bucket.

**Why Lua.** Without it, two nodes can both read "1 token left" and both spend it. Redis runs a script as a single uninterrupted operation, so read, refill, spend and write cannot interleave. The script is defined once and invoked via `EVALSHA`.

**Why Redis `TIME`.** Server clocks drift. Using Redis's clock means every node agrees on what "now" is.

**Fail-open vs fail-closed.** If Redis is unreachable, `fail-open` keeps serving traffic without limiting (availability first), and `fail-closed` returns `503` (protection first). The Redis client uses a 250 ms command timeout and no offline queue, so a hung Redis can't hang the API.

**Shared on/off flag.** The limiter toggle is stored in Redis and cached for about 1 second per node, so one click flips the whole cluster.

## Metrics

| Metric | Labels | Meaning |
|---|---|---|
| `rate_limit_requests_total` | `decision`, `client`, `node` | Allow / reject decisions |
| `http_request_duration_seconds` | `method`, `route`, `status_code`, `node` | Request latency histogram |
| `rate_limiter_errors_total` | `mode`, `node` | Limiter failures (for example Redis down) |

The `client` label is handy for the fairness demo, but it is high-cardinality. Drop it in production.

## Tests

```bash
docker compose up -d redis
pnpm --filter @ratelimit-guard/core test
```

Redis tests are skipped automatically if Redis isn't reachable on `localhost:6379`. The key test fires 300 concurrent requests through 3 separate Redis connections and asserts that exactly 100 are allowed.

## Load testing from the command line

```bash
# one client, 300 requests across all nodes
node loadtest/distributed.js

# raw flood with autocannon
npx autocannon -c 200 -d 30 -H x-client-id=abuser http://localhost:8080/bots
```

## Redis outage test

```bash
# fail-open: users keep being served, limits are not enforced
docker compose stop redis
node loadtest/distributed.js        # allowed = 300, limiter errors rise in Grafana
docker compose start redis

# fail-closed: protect the backend
FAIL_MODE=fail-closed docker compose up -d --no-deps api-1 api-2 api-3
docker compose stop redis
node loadtest/distributed.js        # unavailable = 300 (HTTP 503)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | Run `pnpm approve-builds`, select the listed packages, then `pnpm install` |
| pnpm fails with `EOF while parsing` | A JSON file is empty (`touch` creates 0-byte files). Paste real content into it |
| Docker image pull times out | Check VPN or proxy, restart Docker Desktop, then `docker pull nginx:alpine` |
| Prometheus targets show "no such host" | The API containers aren't running yet. Run `docker compose up -d --build`, then `docker compose restart prometheus` |
| Grafana shows 404 for the dashboard | `ratelimit.json` is empty or invalid. Check `docker compose logs grafana` |
| Grafana iframe is blank | Set `GF_SECURITY_ALLOW_EMBEDDING: "true"` and run `docker compose up -d --no-deps grafana` |
| `docker exec` paths break in Git Bash | Prefix the command with `MSYS_NO_PATHCONV=1` |
| Allowed count is above 100 in the burst demo | `RATE_WINDOW` isn't `1h`, so tokens refilled during the run |
| No 5xx during the flood with the limiter off | Lower `MAX_INFLIGHT` in `apps/demo-api/src/fragile-db.ts` |
| UI stays on "CHECKING…" | The gateway on `:8080` isn't reachable. Check `docker compose ps` |

## Roadmap

- Sliding window counter and leaky bucket behind the same `RateLimiter` interface
- Circuit breaker with fallback responses
- Timeouts, retries with exponential backoff
- Request queue with priorities
- Multi-tenant policies and dynamic configuration
- Fastify plugin

## Limitations

- The demo's database is simulated, so absolute numbers show the trend, not real-world performance
- The Redis command timeout (250 ms) bounds the extra latency added when Redis is slow
- Per-client metric labels are for demos only

## License

MIT
