"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId } from "react";
import { curve } from "../lib/utils";

export function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.20),rgba(34,211,238,0.06)_55%,transparent)] blur-2xl" />
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_75%_50%_at_50%_0%,black,transparent)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-400/60 to-transparent" />
    </div>
  );
}

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export function Spark({ data, color, w = 180, h = 44 }: { data: number[]; color: string; w?: number; h?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (data.length < 2) return <div style={{ height: h }} />;
  const max = Math.max(...data, 0.0001);
  const pts: [number, number][] = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - (v / max) * (h - 8)]);
  const line = curve(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type FlowProps = {
  enabled: boolean | null;
  allowed: number;
  rejected: number;
  errors: number;
  perNode: { node: string; value: number }[];
};

// Clients -> limiter shield -> 3 nodes -> Redis. Dots scale with the live request rates.
export function FlowViz({ enabled, allowed, rejected, errors, perNode }: FlowProps) {
  const unknown = enabled === null;
  const on = enabled === true;
  const ys = [50, 130, 210];
  const nodes = ["node-1", "node-2", "node-3"].map((name, i) => ({
    name,
    y: ys[i],
    rate: perNode.find((p) => p.node === name)?.value ?? 0,
  }));
  const green = allowed > 0.5 ? Math.min(4, Math.ceil(allowed / 40)) : 0;
  const red = on && rejected > 0.5 ? Math.min(8, Math.ceil(rejected / 50)) : 0;
  const stressed = errors > 0.5;
  const route = (y: number) => `M90 130 L345 130 C430 130 440 ${y} 520 ${y}`;

  return (
    <svg viewBox="0 0 900 260" className="w-full">
      <defs>
        <linearGradient id="fv-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
        <radialGradient id="fv-glow">
          <stop offset="0" stopColor="#a855f7" stopOpacity=".55" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* rails */}
      {nodes.map((n) => (
        <path key={n.name} d={route(n.y)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
      ))}
      {nodes.map((n) => (
        <path
          key={`${n.name}-redis`}
          d={`M630 ${n.y} C710 ${n.y} 710 130 790 130`}
          fill="none"
          stroke="rgba(167,139,250,.45)"
          strokeWidth="2"
          strokeDasharray="4 6"
          className="animate-dash"
        />
      ))}

      {/* clients */}
      <rect x="20" y="100" width="70" height="60" rx="14" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.18)" />
      <text x="55" y="135" textAnchor="middle" className="fill-white text-[12px] font-semibold">Clients</text>

      {/* passing traffic */}
      {nodes.flatMap((n) =>
        Array.from({ length: green }, (_, i) => (
          <circle key={`${n.name}-g${i}`} r="4.5" fill="#34d399" style={{ filter: "drop-shadow(0 0 6px #34d399)" }}>
            <animateMotion dur="2.6s" begin={`${(i * 2.6) / green + n.y / 1000}s`} repeatCount="indefinite" path={route(n.y)} />
          </circle>
        )),
      )}

      {/* blocked traffic */}
      {Array.from({ length: red }, (_, i) => (
        <circle key={`r${i}`} r="4.5" fill="#fb7185" style={{ filter: "drop-shadow(0 0 6px #fb7185)" }}>
          <animateMotion dur="1.6s" begin={`${(i * 1.6) / red}s`} repeatCount="indefinite" path="M90 130 L246 130" />
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;.85;1" dur="1.6s" begin={`${(i * 1.6) / red}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {red > 0 && (
        <circle cx="250" cy="130" r="8" fill="none" stroke="#fb7185" strokeWidth="2">
          <animate attributeName="r" values="8;30" dur="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".8;0" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* limiter shield */}
      <g transform="translate(300 130)">
        {on && (
          <circle r="95" fill="url(#fv-glow)">
            <animate attributeName="opacity" values=".6;1;.6" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
        <motion.g
          animate={on ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 2.4, repeat: Infinity }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <path
            d="M0 -55 L45 -39 V-5 C45 25 25 42 0 54 C-25 42 -45 25 -45 -5 V-39 Z"
            fill={on ? "url(#fv-shield)" : "rgba(255,255,255,.07)"}
            stroke={on ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.28)"}
            strokeWidth="2"
            strokeDasharray={on ? undefined : "5 5"}
          />
          {on && <path d="M-16 0 L-5 11 L17 -13" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
        </motion.g>
        <text y="82" textAnchor="middle" className={`text-[12px] font-bold tracking-widest ${on ? "fill-violet-300" : "fill-white/40"}`}>
          {on ? "LIMITER ON" : "LIMITER OFF"}
        </text>
      </g>

      {/* nodes */}
      {nodes.map((n) => (
        <g key={n.name}>
          <rect
            x="520" y={n.y - 28} width="110" height="56" rx="14"
            fill={stressed ? "rgba(251,113,133,.12)" : "rgba(255,255,255,.05)"}
            stroke={stressed ? "#fb7185" : "rgba(255,255,255,.18)"}
            className={stressed ? "animate-pulse" : ""}
          />
          <text x="575" y={n.y - 4} textAnchor="middle" className="fill-white text-[13px] font-semibold">{n.name}</text>
          <text x="575" y={n.y + 15} textAnchor="middle" className="fill-white/50 text-[11px]">{n.rate.toFixed(0)} req/s</text>
        </g>
      ))}

      {/* redis */}
      <rect x="790" y="96" width="90" height="68" rx="16" fill="rgba(139,92,246,.14)" stroke="rgba(167,139,250,.6)" />
      <text x="835" y="126" textAnchor="middle" className="fill-white text-[13px] font-semibold">Redis</text>
      <text x="835" y="144" textAnchor="middle" className="fill-violet-300 text-[11px]">Lua · atomic</text>
    </svg>
  );
}