import { useMemo } from "react";
import { format, parseISO } from "date-fns";

import {
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetSecretAccessVolume } from "@app/hooks/api";

import { LineChart } from "./LineChart";

export const SecretAccessChart = () => {
  const { projectId } = useProject();

  const { data, isPending } = useGetSecretAccessVolume({ projectId }, { enabled: !!projectId });

  const chartData = useMemo(() => {
    if (!data?.days) return [];
    return data.days.map((day) => ({
      label: format(parseISO(day.date), "EEE"),
      value: day.total
    }));
  }, [data]);

  const topActors = useMemo(() => {
    if (!data?.days) return [];
    const totals = new Map<string, { name: string; type: string; count: number }>();
    data.days.forEach((day) => {
      day.actors.forEach((actor) => {
        const key = `${actor.type}:${actor.name}`;
        const existing = totals.get(key);
        if (existing) {
          existing.count += actor.count;
        } else {
          totals.set(key, { ...actor });
        }
      });
    });
    return Array.from(totals.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [data]);

  const totalRequests = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Secret Access Volume</UnstableCardTitle>
        <UnstableCardDescription>Secret read requests over the past 7 days</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        {isPending ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <div className="flex flex-col gap-4">
            <LineChart data={chartData} />
            {topActors.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-label">
                  Top actors — {totalRequests.toLocaleString()} total requests
                </span>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {topActors.map((actor) => (
                    <span key={`${actor.type}:${actor.name}`} className="text-xs text-foreground">
                      <span className="text-label">{actor.type}:</span> {actor.name}{" "}
                      <span className="text-label">({actor.count.toLocaleString()})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
