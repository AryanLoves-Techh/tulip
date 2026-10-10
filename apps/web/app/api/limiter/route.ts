import { GATEWAY } from "../../../lib/server";

export const dynamic = "force-dynamic";

const down = () => Response.json({ error: "gateway unreachable" }, { status: 502 });

export async function GET() {
  try {
    const r = await fetch(`${GATEWAY}/admin/limiter`, { cache: "no-store" });
    return Response.json(await r.json(), { status: r.status });
  } catch {
    return down();
  }
}

export async function POST(req: Request) {
  try {
    const { enabled } = await req.json();
    const r = await fetch(`${GATEWAY}/admin/limiter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: Boolean(enabled) }),
      cache: "no-store",
    });
    return Response.json(await r.json(), { status: r.status });
  } catch {
    return down();
  }
}