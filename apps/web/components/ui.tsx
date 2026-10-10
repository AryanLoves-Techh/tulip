"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

export const buttonClass = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-white text-black hover:bg-white/90",
        outline: "border border-white/10 bg-transparent text-white/90 hover:border-white/20 hover:bg-white/5",
        ghost: "text-white/60 hover:bg-white/5 hover:text-white",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className, variant, size, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonClass>) {
  return <button className={cn(buttonClass({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-white/[0.08] bg-[#0a0a0a]/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition-colors hover:border-white/[0.14]",
        className,
      )}
      {...props}
    />
  );
}

const badge = cva("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide", {
  variants: {
    tone: {
      green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
      rose: "border-rose-400/30 bg-rose-400/10 text-rose-300",
      violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
      slate: "border-white/10 bg-white/5 text-white/60",
    },
  },
  defaultVariants: { tone: "slate" },
});
export function Badge({
  tone, className, ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

export function Banner({ tone = "warn", children }: { tone?: "warn" | "ok"; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "my-4 rounded-xl border px-4 py-3 text-sm",
        tone === "warn"
          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
          : "border-emerald-400/30 bg-emerald-400/10 font-semibold text-emerald-200",
      )}
    >
      {children}
    </motion.div>
  );
}

export function Switch({
  checked, onChange, disabled,
}: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-7 w-14 cursor-pointer rounded-full border transition-all duration-300 disabled:opacity-50",
       checked
          ? "border-emerald-400/40 bg-emerald-500/20"
          : "border-white/12 bg-white/5",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "absolute top-0.5 size-6 rounded-full",
          checked ? "right-0.5 bg-emerald-300" : "left-0.5 bg-white/70",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  id, value, onChange, items,
}: { id: string; value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="relative inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "relative z-10 cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
            value === it.value ? "text-white" : "text-white/50 hover:text-white/80",
          )}
        >
          {value === it.value && (
            <motion.span
              layoutId={id}
              className="absolute inset-0 -z-10 rounded-lg bg-linear-to-r from-violet-500/80 to-fuchsia-500/80 shadow-[0_0_20px_-4px_rgba(168,85,247,.9)]"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Reveal({
  children, delay = 0, className,
}: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}