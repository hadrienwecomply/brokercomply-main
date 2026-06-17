"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekBar } from "@/lib/actions";

const URGENCY_COLOR: Record<WeekBar["urgency"], string> = {
  overdue: "#ea384c",
  soon: "#f0ad4e",
  normal: "#5fbf99",
};

export function WeekDeadlinesChart({
  data,
  activeKey,
  onSelect,
}: {
  data: WeekBar[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="h-44 w-full" aria-label="Charge des échéances sur 7 jours">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#9a9a9a" }}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, max]}
            tickLine={false}
            axisLine={false}
            width={36}
            tick={{ fontSize: 12, fill: "#9a9a9a" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(95,191,153,0.08)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #ebebeb",
              fontSize: 13,
            }}
            labelStyle={{ fontWeight: 600, color: "#1f1d1e" }}
            formatter={(value) => [`${value} action(s)`, "À traiter"]}
          />
          <Bar
            dataKey="count"
            radius={[6, 6, 0, 0]}
            onClick={(_, index) => onSelect(data[index]!.key)}
            cursor="pointer"
            maxBarSize={48}
            isAnimationActive={false}
          >
            {data.map((d) => {
              const dimmed = activeKey !== "all" && activeKey !== d.key;
              return (
                <Cell
                  key={d.key}
                  fill={URGENCY_COLOR[d.urgency]}
                  fillOpacity={dimmed ? 0.28 : 1}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
