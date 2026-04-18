import { useMemo } from "react";
import { InfoIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Tooltip as V3Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetAuthMethodDistribution } from "@app/hooks/api";

// Palette using theme-aligned colors
// 13 muted, dark-theme-friendly base colors (used for legend dots and gradient outer stops)
const COLORS = [
  "#63b0bd", // teal (info)
  "#f1c40f", // gold (warning)
  "#6dbf8b", // sage green
  "#c084d8", // soft purple
  "#e8855e", // burnt orange
  "#5b9bd5", // steel blue
  "#e06b8f", // dusty rose
  "#85c46c", // leaf green
  "#d4a054", // amber
  "#7b8ec4", // periwinkle
  "#cb6b6b", // muted red
  "#4fc1b0", // seafoam
  "#b8a060" // olive gold
];

// Radial gradient IDs for each color — fades from color at outer edge to transparent at center
const gradientId = (index: number) => `pie-radial-${index}`;

export const AuthMethodChart = () => {
  const { projectId } = useProject();

  const { data, isPending } = useGetAuthMethodDistribution(
    { projectId, days: 30 },
    { enabled: !!projectId }
  );

  const methods = data?.methods ?? [];
  const total = useMemo(() => methods.reduce((sum, m) => sum + m.count, 0), [methods]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication Methods</CardTitle>
        <CardDescription>
          Distribution of auth methods used for secret access over the past 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-[260px] w-full" />}
        {!isPending && methods.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No secret access data available</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && methods.length > 0 && (
          <div className="flex items-center gap-8">
            <div className="shrink-0">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <defs>
                    {COLORS.map((color, i) => (
                      <radialGradient
                        key={gradientId(i)}
                        id={gradientId(i)}
                        cx="50%"
                        cy="50%"
                        r="50%"
                        gradientUnits="userSpaceOnUse"
                        fx="110"
                        fy="110"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={0.1} />
                        <stop offset="55%" stopColor={color} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.85} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={methods}
                    dataKey="count"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    strokeWidth={2}
                    stroke="var(--color-card)"
                    paddingAngle={2}
                  >
                    {methods.map((entry, index) => (
                      <Cell
                        key={entry.method}
                        fill={`url(#${gradientId(index % COLORS.length)})`}
                        style={{ outline: "none" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    labelStyle={{ color: "var(--color-foreground)" }}
                    formatter={(value, name) => [
                      `${Number(value).toLocaleString()} (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`,
                      String(name)
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {methods.map((entry, index) => {
                const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                return (
                  <div key={entry.method} className="flex items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="flex-1 text-sm">
                      {entry.method}
                      {entry.method === "Unknown" && (
                        <V3Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="mb-0.5 ml-1 inline size-3 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">
                              Only new requests will display the auth method. Older requests may not
                              have this information recorded.
                            </p>
                          </TooltipContent>
                        </V3Tooltip>
                      )}
                    </span>
                    <span className="text-sm text-muted">{pct}%</span>
                    <span className="min-w-[60px] text-right text-sm font-medium">
                      {entry.count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 border-t border-border pt-2">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 shrink-0" />
                  <span className="flex-1 text-sm font-medium">Total</span>
                  <span className="text-sm text-muted" />
                  <span className="min-w-[60px] text-right text-sm font-medium">
                    {total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
