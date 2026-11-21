import { Card } from "@infisical/cipher/ui/card";
import { DataTable } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { format, parseISO } from "date-fns";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AccessVolumeChart } from "./shared/access-volume-chart";

type Actor = { name: string; type: string; count: number };

export const AccessVolumeCard = ({ projectId }: { projectId: string }) => {
  const { data, isPending, error } = useV4Adapter("secretInsights").useAccessVolume(projectId);
  const days = data?.days ?? [];
  const chartData = days.map((day) => ({
    label: format(parseISO(day.date), "EEE"),
    value: day.total
  }));
  const totals = new Map<string, Actor>();
  days.forEach((day) =>
    day.actors.forEach((actor) => {
      const key = `${actor.type}:${actor.name}`;
      const existing = totals.get(key);
      totals.set(key, {
        ...actor,
        count: (existing?.count ?? 0) + actor.count
      });
    })
  );
  const topActors = [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const totalRequests = chartData.reduce((sum, day) => sum + day.value, 0);

  let body;
  if (isPending) body = <Skeleton height={280} />;
  else if (error)
    body = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load access volume"
        description={errorMessage(error) ?? "Try again in a moment."}
      />
    );
  else if (totalRequests === 0)
    body = <EmptyState size="sm" icon="activity" title="No secret reads in the past 7 days" />;
  else
    body = (
      <Stack gap={16}>
        <AccessVolumeChart data={chartData} valueLabel="Reads" />
        <DataTable<Actor>
          label="Top readers"
          rows={topActors}
          getRowId={(actor) => `${actor.type}:${actor.name}`}
          rowLabel={(actor) => actor.name}
          columns={[
            {
              id: "name",
              header: "Top Readers",
              primary: true,
              grow: true,
              wrap: true,
              text: (actor) => actor.name,
              render: (actor) => (
                <Inline gap={8} align="start" wrap={false}>
                  <Icon
                    name={actor.type === "user" ? "user" : "machine"}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span>{actor.name}</span>
                </Inline>
              )
            },
            {
              id: "count",
              header: "Reads",
              width: 112,
              align: "end",
              text: (actor) => actor.count.toLocaleString(),
              render: (actor) => actor.count.toLocaleString()
            }
          ]}
        />
      </Stack>
    );

  return (
    <Card title="Secret Access Volume" description="Past 7 days">
      {body}
    </Card>
  );
};
