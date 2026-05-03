import { Fragment, useMemo } from "react";
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
  Skeleton
} from "@app/components/v3";
import { useProject } from "@app/context";
import { PamResourceType } from "@app/hooks/api/pam/enums";
import { PAM_RESOURCE_TYPE_MAP } from "@app/hooks/api/pam/maps";
import { useGetPamResourceBreakdown } from "@app/hooks/api/pamInsights";

const knownResourceTypes = Object.values(PamResourceType) as string[];

const COLORS = [
  "#63b0bd",
  "#f1c40f",
  "#6dbf8b",
  "#c084d8",
  "#e8855e",
  "#5b9bd5",
  "#e06b8f",
  "#85c46c",
  "#d4a054",
  "#7b8ec4",
  "#cb6b6b",
  "#4fc1b0",
  "#b8a060"
];

const gradientId = (index: number) => `pam-breakdown-pie-${index}`;

export const PamResourceBreakdown = () => {
  const { projectId } = useProject();
  const { data, isPending } = useGetPamResourceBreakdown({ projectId }, { enabled: !!projectId });

  const rows = useMemo(() => {
    if (!data?.breakdown) return [];
    return data.breakdown.map((entry) => {
      const meta = knownResourceTypes.includes(entry.resourceType)
        ? PAM_RESOURCE_TYPE_MAP[entry.resourceType as PamResourceType]
        : null;
      return {
        ...entry,
        displayName: meta?.name ?? entry.resourceType
      };
    });
  }, [data]);

  const totalResources = useMemo(() => rows.reduce((sum, r) => sum + r.resourceCount, 0), [rows]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Resources by Type</CardTitle>
        <CardDescription>Breakdown of managed resources across integrations</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-[260px] w-full" />}
        {!isPending && rows.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No resources have been added yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && rows.length > 0 && (
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
                    data={rows}
                    dataKey="resourceCount"
                    nameKey="displayName"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    strokeWidth={2}
                    stroke="var(--color-card)"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {rows.map((entry, index) => (
                      <Cell
                        key={entry.resourceType}
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
                    isAnimationActive={false}
                    formatter={(value, name) => [
                      `${Number(value).toLocaleString()} (${
                        totalResources > 0 ? Math.round((Number(value) / totalResources) * 100) : 0
                      }%)`,
                      String(name)
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid flex-1 grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-3 gap-y-2">
              {rows.map((entry, index) => {
                const pct =
                  totalResources > 0 ? Math.round((entry.resourceCount / totalResources) * 100) : 0;
                return (
                  <Fragment key={entry.resourceType}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate text-sm" title={entry.displayName}>
                      {entry.displayName}
                    </span>
                    <span className="text-right text-sm text-muted">{pct}%</span>
                    <span className="text-right text-sm font-medium">
                      {entry.resourceCount.toLocaleString()}
                    </span>
                    <span className="text-left text-xs text-muted">
                      {entry.resourceCount === 1 ? "resource" : "resources"}
                    </span>
                  </Fragment>
                );
              })}
              <div className="col-span-5 mt-1 border-t border-border" />
              <span />
              <span className="text-sm font-medium">Total</span>
              <span />
              <span className="text-right text-sm font-medium">
                {totalResources.toLocaleString()}
              </span>
              <span className="text-left text-xs text-muted">
                {totalResources === 1 ? "resource" : "resources"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
