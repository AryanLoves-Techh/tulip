const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseWindow(w: string | number): number {
  if (typeof w === "number") return w;
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(w.trim());
  if (!m) throw new Error(`Invalid window "${w}" (use e.g. "500ms", "1s", "1m")`);
  return Number(m[1]) * UNITS[m[2] as keyof typeof UNITS];
}