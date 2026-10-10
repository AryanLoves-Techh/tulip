import { GATEWAY } from "../../../lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Bucket = { allowed: number; rejected: number; unavailable: number; errors: number };
type Sec = { ok: number; rejected: number; errors: number; lat: number[] };

const empty = (): Bucket => ({ allowed: 0, rejected: 0, unavailable: 0, errors: 0 });
const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  Math.min(Math.max(Number(v) || d, lo), hi);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clientId = String(body.clientId || `ui-${Date.now()}`);
  const durationMs = clamp(body.durationMs, 0, 120_000, 0); // 0 = use `total` instead
  const total = durationMs ? Infinity : clamp(body.total, 1, 20000, 300);
  const concurrency = clamp(body.concurrency, 1, 400, 30);
  const delayMs = Math.max(0, Number(body.delayMs) || 0);

  const perNode: Record<string, Bucket> = {};
  const totals = empty();
  const secs = new Map<number, Sec>();
  const allLat: number[] = [];
  const started = Date.now();
  const deadline = started + durationMs;
  let next = 0;

  const bump = (node: string, field: keyof Bucket) => {
    (perNode[node] ??= empty())[field]++;
    totals[field]++;
  };
  const bucketNow = () => {
    const t = Math.floor((Date.now() - started) / 1000);
    let s = secs.get(t);
    if (!s) secs.set(t, (s = { ok: 0, rejected: 0, errors: 0, lat: [] }));
    return s;
  };
  const more = () => (durationMs ? Date.now() < deadline : next++ < total);

  const worker = async () => {
    while (more()) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${GATEWAY}/bots`, {
          headers: { "x-client-id": clientId },
          cache: "no-store",
        });
        await res.arrayBuffer();
        const ms = performance.now() - t0;
        const node = res.headers.get("x-node-id") ?? "unknown";
        const s = bucketNow();
        if (res.ok) {
          bump(node, "allowed");
          s.ok++;
          s.lat.push(ms);
          allLat.push(ms);
        } else if (res.status === 429) {
          bump(node, "rejected");
          s.rejected++;
        } else if (res.status === 503) {
          bump(node, "unavailable");
          s.errors++;
        } else {
          bump(node, "errors");
          s.errors++;
        }
      } catch {
        bump("network-error", "errors");
        bucketNow().errors++;
      }
      if (delayMs) await sleep(delayMs);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return Response.json({
    clientId,
    total: totals.allowed + totals.rejected + totals.unavailable + totals.errors,
    perNode,
    totals,
    ms: Date.now() - started,
    latency: { p50: Math.round(pct(allLat, 0.5)), p95: Math.round(pct(allLat, 0.95)) },
    timeline: [...secs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, s]) => ({ t, ok: s.ok, rejected: s.rejected, errors: s.errors, p95: Math.round(pct(s.lat, 0.95)) })),
  });
}