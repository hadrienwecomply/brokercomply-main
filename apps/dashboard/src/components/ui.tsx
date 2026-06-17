import { cn } from "@/lib/cn";
import { STATUS_DOT, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import type { StepStatus } from "@/lib/types";

export function StatusBadge({
  status,
  className,
}: {
  status: StepStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium leading-none",
        STATUS_STYLE[status],
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-pill bg-line", className)}>
      <div
        className="h-full rounded-pill bg-brand-500 transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 60,
  stroke = 6,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (v / 100) * circ;
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={v === 100 ? "var(--color-brand-500)" : "var(--color-brand-500)"}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute font-display text-sm font-semibold tabular-nums text-ink">
        {v}
        <span className="text-[0.6em] text-st-na">%</span>
      </span>
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-white shadow-sm shadow-black/[0.02]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700",
        className,
      )}
      title={name}
    >
      {init}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
      {children}
    </span>
  );
}
