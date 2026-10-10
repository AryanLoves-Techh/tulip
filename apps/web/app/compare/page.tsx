"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, Gauge, Loader2, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatedNumber } from "../../components/bits";
import { Banner, Button, Card, Reveal, buttonClass } from "../../components/ui";
import { cn, curve } from "../../lib/utils";

type Sec = { t: number; ok: number; rejected: number; errors: number; p95: number };
type Res = {
  totals: { allowed: number; rejected: number; unavailable: number; errors: number };
  timeline: Sec[];
  latency: { p50: number; p95: number };
};
type Point = { aliceP95: number | null; served: number; rejected: number; failed: number };
type Band = { from: number; to: number; label: string; color: string };
type Summary = {
  id: string; label: string;
  aliceSuccess: number; aliceP95: number; served: number; rejected: number; failed: number;
};

const GRAFANA = process.env.NEXT_PUBLIC_GRAFANA_URL ?? "http://localhost:3001";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PHASES = [
  { id: "base", label: "Healthy baseline", limiter: false, flood: false, secs: 15, color: "#22d3ee" },
  { id: "off", label: "Flood · limiter OFF", limiter: false, flood: true, secs: 30, color: "#fb7185" },
  { id: "on", label: "Flood · limiter ON", limiter: true, flood: true, secs: 30, color: "#34d399" },
];
const TOTAL = PHASES.reduce((a, p) => a + p.secs, 0);

type Series = { name: string; color: string; values: (number | null)[] };

function Chart({ title, unit, bands, series, running }: { title: string; unit: string; bands: Band[]; series: Series[]; running: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 640, H = 220, L = 46, R = 10, T = 26, B = 22;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = Math.max(1, ...all);
  const x = (i: number) => L + (i / TOTAL) * (W - L - R);
  const y = (v: number) => H - B - (v / max) * (H - T - B);

  return (
    <Card className="p-5">
      <h3 className="mb-2 text-sm font-semibold text-white/80">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity=".4" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {bands.map((b) => (
          <g key={b.label}>
            <motion.rect
              initial={{ opacity: 0 }} animate={{ opacity: 0.14 }}
              x={x(b.from)} y={T} width={x(b.to) - x(b.from)} height={H - T - B} fill={b.color}
            />
            <text x={x(b.from) + 4} y={T - 9} fill={b.color} fontSize="10.5" fontWeight="600">{b.label}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="rgba(255,255,255,.07)" />
        ))}
        <text x={4} y={T + 4} fill="#8a8fa8" fontSize="11">{Math.round(max)}{unit}</text>
        <text x={4} y={H - B} fill="#8a8fa8" fontSize="11">0</text>
        {series.map((s, i) => {
          const pts = s.values
            .map((v, idx) => (v === null ? null : ([x(idx), y(v)] as [number, number])))
            .filter((p): p is [number, number] => p !== null);
          if (pts.length < 2) return null;
          const line = curve(pts);
          const last = pts[pts.length - 1];
          return (
            <g key={s.name}>
              <motion.path initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                d={`${line} L${last[0]},${H - B} L${pts[0][0]},${H - B} Z`} fill={`url(#${uid}${i})`} />
              <motion.path initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 5px ${s.color})` }} />
              {running && (
                <circle cx={last[0]} cy={last[1]} r="4" fill={s.color}>
                  <animate attributeName="r" values="4;8;4" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-white/50">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
    </Card>
  );
}

function Delta({ label, icon: Icon, before, after, unit }: { label: string; icon: typeof Gauge; before: number; after: number; unit: string }) {
  return (
    <Card className="overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-emerald-400 to-transparent" />
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/45">
        <Icon className="size-4" /> {label}
      </div>
      <div className="mt-3 flex items-baseline gap-3 text-3xl font-bold">
        <span className="text-rose-400"><AnimatedNumber value={before} />{unit}</span>
        <ArrowRight className="size-5 self-center text-white/40" />
        <span className="text-emerald-400"><AnimatedNumber value={after} />{unit}</span>
      </div>
    </Card>
  );
}

export default function Compare() {
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [sums, setSums] = useState<Summary[]>([]);

  async function setLimiter(enabled: boolean) {
    const r = await fetch("/api/limiter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!r.ok) throw new Error("gateway");
    await sleep(2000); // every node caches the flag for ~1s
  }

  async function load(body: object): Promise<Res> {
    const r = await fetch("/api/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("load");
    return r.json();
  }

  async function start() {
    setRunning(true);
    setError(null);
    setPoints([]);
    setBands([]);
    setSums([]);
    const run = Date.now().toString(36);
    let offset = 0;
    try {
      for (const p of PHASES) {
        setCurrent(p.label);
        await setLimiter(p.limiter);
        const ms = p.secs * 1000;

        const aliceJob = load({ clientId: `alice-${run}-${p.id}`, durationMs: ms, concurrency: 2, delayMs: 150 });
        const abuserJob = p.flood
          ? load({ clientId: `abuser-${run}-${p.id}`, durationMs: ms, concurrency: 300 })
          : Promise.resolve(null);
        const [alice, abuser] = await Promise.all([aliceJob, abuserJob]);

        const pts: Point[] = [];
        for (let t = 0; t < p.secs; t++) {
          const a = alice.timeline.find((s) => s.t === t);
          const b = abuser?.timeline.find((s) => s.t === t);
          pts.push({
            aliceP95: a && a.ok > 0 ? a.p95 : null,
            served: (a?.ok ?? 0) + (b?.ok ?? 0),
            rejected: (a?.rejected ?? 0) + (b?.rejected ?? 0),
            failed: (a?.errors ?? 0) + (b?.errors ?? 0),
          });
        }

        const aT = alice.totals;
        const aAll = aT.allowed + aT.rejected + aT.unavailable + aT.errors;
        const bT = abuser?.totals;
        const summary: Summary = {
          id: p.id,
          label: p.label,
          aliceSuccess: aAll ? (aT.allowed / aAll) * 100 : 0,
          aliceP95: alice.latency.p95,
          served: (aT.allowed + (bT?.allowed ?? 0)) / p.secs,
          rejected: (aT.rejected + (bT?.rejected ?? 0)) / p.secs,
          failed: (aT.errors + aT.unavailable + (bT ? bT.errors + bT.unavailable : 0)) / p.secs,
        };

        const from = offset; // capture before the loop moves it
        setPoints((prev) => [...prev, ...pts]);
        setBands((prev) => [...prev, { from, to: from + p.secs, label: p.label, color: p.color }]);
        setSums((prev) => [...prev, summary]);
        offset += p.secs;
      }
    } catch {
      setError("Run failed. Is the cluster up (docker compose up -d) and the gateway on :8080?");
    } finally {
      setRunning(false);
      setCurrent("");
    }
  }

  const off = sums.find((s) => s.id === "off");
  const on = sums.find((s) => s.id === "on");

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      <Reveal>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="animate-shimmer bg-linear-to-r from-rose-300 via-fuchsia-200 to-emerald-300 bg-[length:200%_auto] bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Before / After
            </h1>
            <p className="mt-1 text-sm text-white/50">Same cluster, same Redis, same traffic. Only the limiter flag changes.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className={buttonClass({ variant: "outline" })}><ArrowLeft className="size-4" /> Control panel</Link>
            <Button size="lg" onClick={start} disabled={running}>
              {running ? <><Loader2 className="size-4 animate-spin" /> {current}…</> : <><Play className="size-4" /> Run before / after (~90s)</>}
            </Button>
          </div>
        </header>
      </Reveal>

      <AnimatePresence>{error && <Banner>{error}</Banner>}</AnimatePresence>

      {/* phase stepper */}
      <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {PHASES.map((p) => {
          const done = sums.some((s) => s.id === p.id);
          const active = running && current === p.label;
          return (
            <Reveal key={p.id}>
              <div className={cn(
                "relative overflow-hidden rounded-xl border px-4 py-3 transition-colors",
                active ? "border-white/30 bg-white/10" : "border-white/10 bg-white/[0.03]",
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="size-2.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>
                  {done ? <CircleCheck className="size-4 text-emerald-400" /> : active ? <Loader2 className="size-4 animate-spin text-white/60" /> : <span className="text-xs text-white/35">{p.secs}s</span>}
                </div>
                {active && (
                  <motion.div
                    key={`${p.id}-bar`}
                    className="absolute bottom-0 left-0 h-0.5"
                    style={{ background: p.color }}
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: p.secs + 2, ease: "linear" }}
                  />
                )}
              </div>
            </Reveal>
          );
        })}
      </section>

      <AnimatePresence>
        {off && on && (
          <motion.section
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <Delta label="Normal user success" icon={ShieldCheck} before={off.aliceSuccess} after={on.aliceSuccess} unit="%" />
            <Delta label="Normal user p95" icon={Gauge} before={off.aliceP95} after={on.aliceP95} unit="ms" />
            <Delta label="Backend failures" icon={TriangleAlert} before={off.failed} after={on.failed} unit="/s" />
          </motion.section>
        )}
      </AnimatePresence>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Chart
          title="Normal user: p95 latency" unit=" ms" bands={bands} running={running}
          series={[{ name: "alice p95", color: "#22d3ee", values: points.map((p) => p.aliceP95) }]}
        />
        <Chart
          title="Backend: served vs failed per second" unit="/s" bands={bands} running={running}
          series={[
            { name: "served (200)", color: "#34d399", values: points.map((p) => p.served) },
            { name: "failed (5xx)", color: "#fb7185", values: points.map((p) => p.failed) },
          ]}
        />
        <Chart
          title="Blocked by limiter (429) per second" unit="/s" bands={bands} running={running}
          series={[{ name: "429 rejected", color: "#fbbf24", values: points.map((p) => p.rejected) }]}
        />
        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold text-white/80">Summary</h3>
          {sums.length === 0 ? (
            <p className="text-sm text-white/40">Run the demo to fill this in.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40">
                  <th className="py-2 font-medium">Phase</th><th className="font-medium">Alice ok</th><th className="font-medium">Alice p95</th>
                  <th className="font-medium">Served/s</th><th className="font-medium">5xx/s</th><th className="font-medium">429/s</th>
                </tr>
              </thead>
              <tbody>
                {sums.map((s) => (
                  <tr key={s.id} className="border-t border-white/8">
                    <td className="py-2">{s.label}</td>
                    <td>{s.aliceSuccess.toFixed(0)}%</td>
                    <td>{s.aliceP95} ms</td>
                    <td>{s.served.toFixed(0)}</td>
                    <td className={s.failed > 1 ? "text-rose-400" : ""}>{s.failed.toFixed(0)}</td>
                    <td className="text-amber-300">{s.rejected.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">The same run in Grafana (from Prometheus)</h2>
        <a className={buttonClass({ variant: "ghost", size: "sm" })} href={`${GRAFANA}/d/ratelimit-guard`} target="_blank" rel="noreferrer">
          Open in new tab <ExternalLink className="size-3.5" />
        </a>
      </div>
      <Card className="overflow-hidden p-2">
        <iframe
          className="h-[1000px] w-full rounded-xl bg-black/40"
          src={`${GRAFANA}/d/ratelimit-guard?orgId=1&kiosk&theme=dark&refresh=5s&from=now-5m&to=now`}
          title="Grafana"
        />
      </Card>
    </main>
  );
}