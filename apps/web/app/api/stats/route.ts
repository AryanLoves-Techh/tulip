import { PROM } from "../../../lib/server";

export const dynamic = "force-dynamic";

type Sample = { metric: Record<string, string>; value: [number, string] };

async function query(expr: string): Promise<Sample[]> {
  const r = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(expr)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("prometheus error");
  const j = await r.json();
  return j.data?.result ?? [];
}

const num = (s?: Sample) => {
  const v = Number(s?.value[1]);
  return Number.isFinite(v) ? v : 0; // NaN appears when there is no traffic
};

export async function GET() {
  try {
    const [allowed, rejected, fivexx, p95, nodes, clients] = await Promise.all([
      query(`sum(rate(rate_limit_requests_total{decision="allowed"}[15s]))`),
      query(`sum(rate(rate_limit_requests_total{decision="rejected"}[15s]))`),
      query(`sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[15s]))`),
      query(`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{status_code!="429"}[15s])))`),
      query(`sum by (node) (rate(rate_limit_requests_total{decision="allowed"}[15s]))`),
      query(`topk(5, sum by (client) (rate(rate_limit_requests_total{decision="rejected"}[15s])))`),
    ]);

    return Response.json({
      allowed: num(allowed[0]),
      rejected: num(rejected[0]),
      errors5xx: num(fivexx[0]),
      p95: num(p95[0]),
      perNode: nodes
        .map((s) => ({ node: s.metric.node ?? "?", value: num(s) }))
        .sort((a, b) => a.node.localeCompare(b.node)),
      topRejected: clients.map((s) => ({ client: s.metric.client ?? "?", value: num(s) })),
    });
  } catch {
    return Response.json({ error: "prometheus unreachable" }, { status: 502 });
  }
}