import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ActivityIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { TOrgSecretAccessVolume } from "@app/hooks/api";
import { LineChart } from "@app/pages/secret-manager/InsightsPage/components/LineChart";

export const SecretAccessVolumeCard = ({ data }: { data: TOrgSecretAccessVolume }) => {
  const chartData = useMemo(
    () =>
      data.days.map((day) => ({
        label: format(parseISO(day.date), "EEE"),
        value: day.total
      })),
    [data.days]
  );

  const peak = useMemo(() => {
    if (data.days.length === 0) return null;
    return data.days.reduce((max, day) => (day.total > max.total ? day : max));
  }, [data.days]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Secret Access Volume</CardTitle>
        <CardDescription>Secret read requests across all projects, past 7 days.</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 && (
          <Empty frame="dashed" className="hover:bg-container">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ActivityIcon />
              </EmptyMedia>
              <EmptyTitle>No secret reads in the past 7 days</EmptyTitle>
              <EmptyDescription>
                Every secret read across your projects is counted here, by day.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {chartData.length > 0 && (
          <div className="flex flex-col gap-4">
            <LineChart
              data={chartData}
              valueLabel="Reads"
              gradientId="org-access-volume"
              height={240}
            />
            {peak && peak.total > 0 && (
              <span className="text-xs text-accent">
                Peak: {peak.total.toLocaleString()} reads on{" "}
                {format(parseISO(peak.date), "EEE, MMM d")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
