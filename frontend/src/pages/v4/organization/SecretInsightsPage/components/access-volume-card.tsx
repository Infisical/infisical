import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { SmallText } from "@infisical/cipher/ui/text";
import { format, parseISO } from "date-fns";

import type { TOrgSecretAccessVolume } from "@app/hooks/api/secretInsights/types";

import { AccessVolumeChart } from "../../../secret-manager/InsightsPage/shared/access-volume-chart";

export const AccessVolumeCard = ({ data }: { data: TOrgSecretAccessVolume }) => {
  const peak = data.days.length
    ? data.days.reduce((max, day) => (day.total > max.total ? day : max))
    : null;

  return (
    <Card
      variant="framed"
      title="Secret Access Volume"
      hint="Secret read requests across all projects, past 7 days."
    >
      {data.days.length === 0 ? (
        <EmptyState
          size="sm"
          icon="activity"
          title="No secret reads in the past 7 days"
          description="Every secret read across your projects is counted here, by day."
        />
      ) : (
        <Stack gap={8}>
          <AccessVolumeChart
            data={data.days.map((day) => ({
              label: format(parseISO(day.date), "EEE"),
              value: day.total
            }))}
            valueLabel="Reads"
            height={240}
          />
          {peak && peak.total > 0 && (
            <SmallText muted>
              {`Peak: ${peak.total.toLocaleString()} reads on ${format(parseISO(peak.date), "EEE, MMM d")}`}
            </SmallText>
          )}
        </Stack>
      )}
    </Card>
  );
};
