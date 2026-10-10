"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, ArrowRight, Ban, ExternalLink, Flame, Gauge, Loader2,
  Play, Shield, ShieldCheck, TriangleAlert, Users, Zap,
} from "lucide-react";
import { AnimatedNumber, FlowViz, Spark } from "../components/bits";
import { Badge, Banner, Button, Card, Reveal, Segmented, Switch, buttonClass } from "../components/ui";

type Bucket = { allowed: number; rejected: number; unavailable: number; errors: number };
type LoadResult = { clientId: string; total: number; perNode: Record<string, Bucket>; totals: Bucket; ms: number };
type Stats = {
  allowed: number;
  rejected: number;
  errors5xx: number;
  p95: number;
  perNode: { node: string; value: number }[];
  topRejected: { client: string; value: number }[];
};
type Run = { name: string; at: string; items: { label: string; result: LoadResult }[] };

const LIMIT = 100; 
const GRAFANA = process.env.NEXT_PUBLIC_GRAFANA_URL ?? "http://localhost:3001";
const rid = () => Math.random().toString(36).slice(2, 7);

const scenarios = [
  {
    id: "burst",
    title: "Distributed burst",
    icon: Zap,
    accent: "#22d3ee",
    desc: `300 requests from ONE client through nginx to 3 nodes. About ${LIMIT} should be allowed, not 300 (exactly ${LIMIT} with RATE_WINDOW=1h).`,
    jobs: () => [{ label: "one client", body: { clientId: `demo-${rid()}`, total: 300, concurrency: 30 } }],
  },
  {
    id: "fair",
    title: "Abuser vs normal user",
    icon: Users,
    accent: "#a78bfa",
    desc: "One client hammers the API while another sends a few polite requests.",
    jobs: () => {
      const s = rid();
      return [
        { label: "abuser", body: { clientId: `abuser-${s}`, total: 3000, concurrency: 60 } },
        { label: "alice", body: { clientId: `alice-${s}`, total: 40, concurrency: 1, delayMs: 150 } },
      ];
    },
  },
  {
    id: "flood",
    title: "Flood the backend",
    icon: Flame,
    accent: "#fb7185",
    desc: "6,000 requests at 350 concurrency. Run it with the limiter OFF, then ON, and compare 5xx and latency.",
    jobs: () => [{ label: "flood", body: { clientId: `flood-${rid()}`, total: 6000, concurrency: 350 } }],
  },
];

function Metric(props: {
  label: string; value: number; decimals?: number; unit: string; data: number[];
  color: string; icon: typeof Activity; delay: number;
}) {
  const Icon = props.icon;
  return (
    <Reveal delay={props.delay}>
      <Card className="overflow-hidden p-5">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${props.color}, transparent)` }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-white/45">{props.label}</span>
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: `${props.color}22`, color: props.color }}>
            <Icon className="size-4" />
          </span>
        </div>
        <div className="mt-2 text-4xl font-bold tracking-tight">
          <AnimatedNumber value={props.value} decimals={props.decimals ?? 1} />
          <span className="ml-1 text-sm font-normal text-white/40">{props.unit}</span>
        </div>
        <div className="mt-2"><Spark data={props.data} color={props.color} /></div>
      </Card>
    </Reveal>
  );
}

function ResultCard({ label, r, check }: { label: string; r: LoadResult; check: boolean }) {
  const nodes = Object.entries(r.perNode).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...nodes.map(([, b]) => b.allowed), 1);
  const pass = check && r.totals.allowed === LIMIT;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-sm">{label}</strong>
        <code className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-white/60">{r.clientId}</code>
        <span className="text-xs text-white/40">{r.total} requests in {(r.ms / 1000).toFixed(1)}s</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-white/40">
            <th className="py-2 font-medium">Node</th><th className="font-medium">Allowed</th>
            <th className="font-medium">Rejected (429)</th><th className="font-medium">Unavailable (503)</th><th className="font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map(([n, b]) => (
            <tr key={n} className="border-t border-white/8">
              <td className="py-2">{n}</td>
              <td>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      className="h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${(b.allowed / max) * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  {b.allowed}
                </div>
              </td>
              <td className="text-amber-300">{b.rejected}</td>
              <td>{b.unavailable}</td>
              <td>{b.errors}</td>
            </tr>
          ))}
          <tr className="border-t border-white/15 font-bold">
            <td className="py-2">TOTAL</td><td>{r.totals.allowed}</td>
            <td className="text-amber-300">{r.totals.rejected}</td><td>{r.totals.unavailable}</td><td>{r.totals.errors}</td>
          </tr>
        </tbody>
      </table>
      {check && (
        <div className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${pass ? "border-emerald-400/30 bg-emerald-400/10 font-semibold text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
          {pass && <ShieldCheck className="size-5" />}
          {pass ? `PASS: exactly ${LIMIT} allowed across all nodes` : `allowed = ${r.totals.allowed} (configured limit: ${LIMIT})`}
        </div>
      )}
    </div>
  );
}

function LiveDot({ offline }: { offline: boolean }) {
  const c = offline ? "bg-rose-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <span className="relative flex size-2.5">
        {!offline && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${c}`} />}
        <span className={`relative inline-flex size-2.5 rounded-full ${c}`} />
      </span>
      {offline ? "Prometheus offline" : "Live"}
    </div>
  );
}

export default function Page() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [offline, setOffline] = useState(false);
  const [hist, setHist] = useState({ allowed: [] as number[], rejected: [] as number[], p95: [] as number[], e5: [] as number[] });
  const [running, setRunning] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"control" | "grafana">("control");
  const lastToggle = useRef(0);

    useEffect(() => {
    let stop = false;
    const sync = async () => {
        // right after a manual toggle, nodes may still hold the old cached value for ~1s
        if (Date.now() - lastToggle.current < 3000) return;
        try {
        const r = await fetch("/api/limiter", { cache: "no-store" });
        const j = await r.json();
        if (!stop && typeof j.enabled === "boolean") setEnabled(j.enabled);
        } catch {
        /* gateway unreachable: keep the last known state */
        }
    };
    sync();
    const id = setInterval(sync, 2000);
    return () => {
        stop = true;
        clearInterval(id);
    };
    }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const s: Stats = await r.json();
        if (stop) return;
        setStats(s);
        setOffline(false);
        const keep = (a: number[], v: number) => [...a, v].slice(-60);
        setHist((h) => ({
          allowed: keep(h.allowed, s.allowed),
          rejected: keep(h.rejected, s.rejected),
          p95: keep(h.p95, s.p95 * 1000),
          e5: keep(h.e5, s.errors5xx),
        }));
      } catch {
        if (!stop) setOffline(true);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const toggle = async () => {
    lastToggle.current = Date.now();
    setError(null);
    try {
      const r = await fetch("/api/limiter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setEnabled(Boolean(j.enabled));
    } catch {
      setError("Could not reach the gateway. Is `docker compose up` running?");
    }
  };

  const run = async (s: (typeof scenarios)[number]) => {
    setRunning(s.id);
    setError(null);
    try {
      const jobs = s.jobs();
      const results: LoadResult[] = await Promise.all(
        jobs.map(async (j) => {
          const r = await fetch("/api/load", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(j.body),
          });
          if (!r.ok) throw new Error("load failed");
          return r.json();
        }),
      );
      setRuns((prev) =>
        [
          { name: s.title, at: new Date().toLocaleTimeString(), items: jobs.map((j, i) => ({ label: j.label, result: results[i] })) },
          ...prev,
        ].slice(0, 4),
      );
    } catch {
      setError("Load run failed. Check that the gateway is up on :8080.");
    } finally {
      setRunning(null);
    }
  };

  const maxNode = Math.max(...(stats?.perNode.map((x) => x.value) ?? [0]), 0.0001);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      <Reveal>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_32px_-4px_rgba(168,85,247,.9)]">
              <Shield className="size-6 text-white" />
            </div>
            <div>
              <h1 className="animate-shimmer bg-linear-to-r from-violet-300 via-cyan-200 to-fuchsia-300 bg-[length:200%_auto] bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                Tulip
              </h1>
              <p className="text-sm text-white/50">Distributed rate limiting · token bucket · Redis + Lua · 3 nodes</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LiveDot offline={offline} />
            <Link href="/compare" className={buttonClass({ variant: "outline" })}>
              Before / After <ArrowRight className="size-4" />
            </Link>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-2 pl-4 pr-3">
              <Badge tone={enabled ? "green" : "amber"}>{enabled === null ? "…" : enabled ? "LIMITER ON" : "LIMITER OFF"}</Badge>
              <Switch checked={!!enabled} disabled={enabled === null} onChange={toggle} />
            </div>
          </div>
        </header>
      </Reveal>

      <div className="mt-8">
        <Segmented
          id="tabs"
          value={tab}
          onChange={setTab}
          items={[{ value: "control", label: "Control panel" }, { value: "grafana", label: "Grafana dashboard" }]}
        />
      </div>

      <AnimatePresence>{error && <Banner>{error}</Banner>}</AnimatePresence>

      {tab === "grafana" ? (
        <Reveal className="mt-5">
          <Card className="overflow-hidden p-2">
            <div className="flex justify-end p-2">
              <a className={buttonClass({ variant: "ghost", size: "sm" })} href={`${GRAFANA}/d/ratelimit-guard`} target="_blank" rel="noreferrer">
                Open in new tab <ExternalLink className="size-3.5" />
              </a>
            </div>
            <iframe
              className="h-[1000px] w-full rounded-xl bg-black/40"
              src={`${GRAFANA}/d/ratelimit-guard?orgId=1&kiosk&theme=dark&refresh=5s`}
              title="Grafana"
            />
          </Card>
        </Reveal>
      ) : (
        <>
          <AnimatePresence>{offline && <Banner>Prometheus not reachable on :9090. Live metrics are paused.</Banner>}</AnimatePresence>

          <Reveal delay={0.08} className="mt-5">
            <Card className="overflow-hidden p-4 sm:p-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/80">Live traffic flow</h2>
                <span className="text-xs text-white/40">refreshes every 2s from Prometheus</span>
              </div>
              <FlowViz
                enabled={enabled}
                allowed={stats?.allowed ?? 0}
                rejected={stats?.rejected ?? 0}
                errors={stats?.errors5xx ?? 0}
                perNode={stats?.perNode ?? []}
              />
            </Card>
          </Reveal>

          <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Allowed" value={stats?.allowed ?? 0} unit="req/s" data={hist.allowed} color="#34d399" icon={Activity} delay={0.12} />
            <Metric label="Rejected (429)" value={stats?.rejected ?? 0} unit="req/s" data={hist.rejected} color="#fbbf24" icon={Ban} delay={0.17} />
            <Metric label="Backend 5xx" value={stats?.errors5xx ?? 0} unit="req/s" data={hist.e5} color="#fb7185" icon={TriangleAlert} delay={0.22} />
            <Metric label="p95 latency" value={(stats?.p95 ?? 0) * 1000} decimals={0} unit="ms" data={hist.p95} color="#22d3ee" icon={Gauge} delay={0.27} />
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal delay={0.3}>
              <Card className="h-full p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/80">Allowed per node</h3>
                {stats?.perNode.length ? (
                  stats.perNode.map((n) => (
                    <div key={n.node} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-14 text-white/70">{n.node}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          className="h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (n.value / maxNode) * 100)}%` }}
                          transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        />
                      </div>
                      <span className="w-16 text-right tabular-nums text-white/60">{n.value.toFixed(1)}/s</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/40">No traffic yet. Run a scenario below.</p>
                )}
              </Card>
            </Reveal>
            <Reveal delay={0.35}>
              <Card className="h-full p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/80">Most rejected clients</h3>
                {stats?.topRejected.length ? (
                  stats.topRejected.map((c) => (
                    <div key={c.client} className="flex items-center justify-between py-1.5 text-sm">
                      <code className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-rose-300">{c.client}</code>
                      <span className="tabular-nums text-white/60">{c.value.toFixed(1)}/s</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/40">Nobody is being rejected right now.</p>
                )}
              </Card>
            </Reveal>
          </section>

          <h2 className="mb-3 mt-10 text-lg font-semibold">Traffic scenarios</h2>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {scenarios.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.id} delay={0.4 + i * 0.06}>
                  <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="h-full">
                    <Card className="flex h-full flex-col p-5">
                      <div
                        className="absolute inset-x-0 top-0 h-px"
                        style={{ background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)` }}
                      />
                      <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${s.accent}22`, color: s.accent }}>
                        <Icon className="size-5" />
                      </span>
                      <h3 className="mt-3 font-semibold">{s.title}</h3>
                      <p className="mb-4 mt-1 flex-1 text-sm text-white/50">{s.desc}</p>
                      <Button disabled={running !== null} onClick={() => run(s)}>
                        {running === s.id ? <><Loader2 className="size-4 animate-spin" /> Running…</> : <><Play className="size-4" /> Run</>}
                      </Button>
                    </Card>
                  </motion.div>
                </Reveal>
              );
            })}
          </section>

          {runs.length > 0 && <h2 className="mb-3 mt-10 text-lg font-semibold">Results</h2>}
          <AnimatePresence initial={false}>
            {runs.map((run, i) => (
              <motion.div
                key={`${run.name}-${run.at}-${i}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4"
              >
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{run.name}</h3>
                    <span className="text-xs text-white/40">{run.at}</span>
                  </div>
                  {run.items.map((it) => (
                    <ResultCard key={it.result.clientId} label={it.label} r={it.result} check={run.name === "Distributed burst"} />
                  ))}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </>
      )}
    </main>
  );
}