import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { format, parseISO } from "date-fns";

import type { TOrgSecretAccessVolume } from "@app/hooks/api/secretInsights/types";

import { AccessVolumeChart } from "../../../secret-manager/InsightsPage/shared/access-volume-chart";

export const AccessVolumeCard = ({ data }: { data: TOrgSecretAccessVolume }) => (
  <Card
    variant="framed"
    title="Secret Access Volume"
    hint="Secret read requests across all projects, past 7 days."
  >
    {data.days.length === 0 ? (
      <EmptyState size="sm" icon="activity" title="No secret reads in the past 7 days" />
    ) : (
      <AccessVolumeChart
        data={data.days.map((day) => ({
          label: format(parseISO(day.date), "EEE"),
          value: day.total
        }))}
        valueLabel="Reads"
        height={240}
      />
    )}
  </Card>
);
