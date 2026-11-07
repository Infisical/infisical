import { useParams } from "@tanstack/react-router";

import { Card, CardLink } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Progress } from "@app/components/v4/ui/progress";
import { Heading } from "@app/components/v4/ui/text";
import type { TDashboardStats } from "@app/hooks/api/certificates/types";

import { formatShare } from "./dashboard.utils";

export const InventoryCard = ({ stats }: { stats: TDashboardStats }) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { total, active, renewed, expired, revoked } = stats.totals;
  return (
    <Card
      variant="framed"
      className="relative"
      title={
        <CardLink to="/v4/organizations/$orgId/cert-manager/inventory" params={{ orgId }}>
          Certificates
        </CardLink>
      }
      action={<Icon name="cert" />}
    >
      <Stack gap={16}>
        <Heading level={3} size="display">
          {total}
        </Heading>
        <Progress
          label="Active"
          valueLabel={`${active} (${formatShare(active, total)})`}
          value={active}
          max={total}
        />
        <DataList
          variant="meta"
          items={[
            ["Renewed", renewed],
            ["Expired", expired],
            ["Revoked", revoked]
          ]}
        />
      </Stack>
    </Card>
  );
};
