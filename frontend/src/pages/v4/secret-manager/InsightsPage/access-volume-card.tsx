import { Card } from "@infisical/cipher/ui/card";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { SmallText } from "@infisical/cipher/ui/text";
import { format, parseISO } from "date-fns";

import { useV4Adapter } from "../../data/adapters";
import { AccessVolumeChart } from "./shared/access-volume-chart";

export const AccessVolumeCard = ({ projectId }: { projectId: string }) => {
  const { data, isPending } = useV4Adapter("secretInsights").useAccessVolume(projectId);
  const days = data?.days ?? [];
  const chartData = days.map((day) => ({
    label: format(parseISO(day.date), "EEE"),
    value: day.total
  }));
  const totals = new Map<string, { name: string; type: string; count: number }>();
  days.forEach((day) =>
    day.actors.forEach((actor) => {
      const key = `${actor.type}:${actor.name}`;
      const existing = totals.get(key);
      totals.set(key, { ...actor, count: (existing?.count ?? 0) + actor.count });
    })
  );
  const topActors = [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const totalRequests = chartData.reduce((sum, day) => sum + day.value, 0);

  return (
    <Card title="Secret Access Volume" description="Secret read requests over the past 7 days.">
      {isPending ? (
        <Skeleton height={280} />
      ) : (
        <Stack gap={16}>
          <AccessVolumeChart data={chartData} />
          {topActors.length > 0 && (
            <Stack gap={8}>
              <SmallText muted>
                Top actors of {totalRequests.toLocaleString()} total requests
              </SmallText>
              <Inline gap={16}>
                {topActors.map((actor) => (
                  <Inline key={`${actor.type}:${actor.name}`} gap={4} wrap={false}>
                    <SmallText muted>{actor.type}:</SmallText>
                    <SmallText>{actor.name}</SmallText>
                    <SmallText muted>({actor.count.toLocaleString()})</SmallText>
                  </Inline>
                ))}
              </Inline>
            </Stack>
          )}
        </Stack>
      )}
    </Card>
  );
};
