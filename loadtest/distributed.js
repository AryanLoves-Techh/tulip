// Sends TOTAL requests through nginx for ONE client id and shows where they landed.
const BASE = process.env.BASE_URL || "http://localhost:8080";
const TOTAL = Number(process.env.TOTAL || 300);
const LIMIT = Number(process.env.LIMIT || 100);
const CONCURRENCY = Number(process.env.CONCURRENCY || 30);
const CLIENT = process.env.CLIENT_ID || `demo-${Date.now()}`;

(async () => {
  const perNode = {};
  const totals = { allowed: 0, rejected: 0, unavailable: 0, errors: 0 };
  const bump = (node, field) => {
    perNode[node] = perNode[node] || { allowed: 0, rejected: 0, unavailable: 0, errors: 0 };
    perNode[node][field]++;
    totals[field]++;
  };

  const one = async () => {
    try {
      const res = await fetch(`${BASE}/bots`, { headers: { "x-client-id": CLIENT } });
      await res.arrayBuffer();
      const node = res.headers.get("x-node-id") || "unknown";
      if (res.ok) bump(node, "allowed");
      else if (res.status === 429) bump(node, "rejected");
      else if (res.status === 503) bump(node, "unavailable"); // limiter down + fail-closed
      else bump(node, "errors");
    } catch {
      bump("network-error", "errors");
    }
  };

  let next = 0;
  const worker = async () => {
    while (next++ < TOTAL) await one();
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nclient id: ${CLIENT}   (select it in the Grafana "Client" dropdown)\n`);
  console.table(perNode);
  console.log("TOTAL", totals);
  console.log(
    totals.allowed === LIMIT
      ? `\nPASS: exactly ${LIMIT} allowed across all nodes\n`
      : `\nallowed=${totals.allowed} (configured limit: ${LIMIT})\n`,
  );
})();