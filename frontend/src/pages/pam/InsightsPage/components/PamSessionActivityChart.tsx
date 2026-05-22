import { useMemo } from "react";
import { format, parseISO } from "date-fns";

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
import { useGetPamSessionActivity } from "@app/hooks/api/pamInsights";
import { LineChart } from "@app/pages/secret-manager/InsightsPage/components/LineChart";

type ChartPoint = {
  date: string;
  label: string;
  value: number;
  showTickLabel: string | null;
};

const buildAxisTicks = (data: ChartPoint[]): string[] => {
  if (!data.length) return [];
  const ticks: string[] = [];
  data.forEach((point, index) => {
    if (index === 0 || index === data.length - 1) {
      ticks.push(point.label);
      return;
    }
    if (index % 7 === 0) ticks.push(point.label);
  });
  return ticks;
};

export const PamSessionActivityChart = () => {
  const { projectId } = useProject();
  const { data, isPending } = useGetPamSessionActivity({ projectId }, { enabled: !!projectId });

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data?.days) return [];
    return data.days.map((day, index, days) => {
      const isLast = index === days.length - 1;
      const isFirst = index === 0;
      const parsed = parseISO(day.date);
      let tickLabel: string | null = null;
      if (isLast) tickLabel = "Today";
      else if (isFirst || index % 7 === 0) tickLabel = format(parsed, "MMM d");
      return {
        date: day.date,
        label: day.date,
        value: day.count,
        showTickLabel: tickLabel
      };
    });
  }, [data]);

  const ticks = useMemo(() => buildAxisTicks(chartData), [chartData]);
  const totalSessions = chartData.reduce((sum, d) => sum + d.value, 0);
  const hasAnyData = totalSessions > 0;

  const tickFormatter = (date: string) => {
    const point = chartData.find((p) => p.date === date);
    return point?.showTickLabel ?? "";
  };

  const renderBody = () => {
    if (isPending) return <Skeleton className="h-[280px] w-full" />;
    if (!hasAnyData) {
      return (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>No sessions in the last 30 days</EmptyTitle>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <LineChart
          data={chartData}
          ticks={ticks}
          tickFormatter={tickFormatter}
          valueLabel="Sessions"
          gradientId="pam-session-activity-gradient"
        />
        <span className="text-xs text-muted">
          {totalSessions.toLocaleString()} sessions in the last 30 days &middot;{" "}
          {(data?.avgPerDay ?? 0).toLocaleString()} per day on average
        </span>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Activity</CardTitle>
        <CardDescription>PAM sessions started over the past 30 days</CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
