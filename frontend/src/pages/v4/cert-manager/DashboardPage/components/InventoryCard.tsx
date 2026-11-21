import { Card, CardLink } from "@infisical/cipher/ui/card";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Progress } from "@infisical/cipher/ui/progress";
import { Heading } from "@infisical/cipher/ui/text";
import { useParams } from "@tanstack/react-router";

import type { TDashboardStats } from "@app/hooks/api/certificates/types";

import { v4Path } from "../../../links";
import { formatShare } from "./dashboard.utils";

export const InventoryCard = ({ stats }: { stats: TDashboardStats }) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { total, active, renewed, expired, revoked } = stats.totals;
  return (
    <Card
      variant="framed"
      className="relative"
      title={
        <CardLink
          link={{ to: v4Path("/organizations/$orgId/cert-manager/inventory"), params: { orgId } }}
        >
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
