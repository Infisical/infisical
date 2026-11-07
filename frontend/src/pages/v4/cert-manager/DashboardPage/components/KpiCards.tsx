import { useParams } from "@tanstack/react-router";

import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Card, CardLink } from "@app/components/v4/ui/card";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Heading, Meta } from "@app/components/v4/ui/text";
import type { TDashboardStats } from "@app/hooks/api/certificates/types";

import { formatShare, type InventoryFilters } from "./dashboard.utils";

const cards: {
  key: keyof TDashboardStats["totals"];
  label: string;
  subtitle?: string;
  icon: IconName;
  filters: InventoryFilters;
}[] = [
  {
    key: "total",
    label: "Total certificates",
    icon: "cert",
    filters: {}
  },
  {
    key: "active",
    label: "Active",
    icon: "check-c",
    filters: { filterStatus: "active" }
  },
  {
    key: "expiringSoon",
    label: "Expiring soon",
    subtitle: "In the next 30 days",
    icon: "clock",
    filters: { filterStatus: "active", filterExpiresDays: "30" }
  },
  {
    key: "expired",
    label: "Expired",
    icon: "alert-c",
    filters: { filterStatus: "expired" }
  },
  {
    key: "revoked",
    label: "Revoked",
    icon: "alert",
    filters: { filterStatus: "revoked" }
  }
];

const badgeFor = (
  key: (typeof cards)[number]["key"],
  stats: TDashboardStats
): { tone: BadgeTone; label: string } | null => {
  const { total, active, revoked } = stats.totals;
  if (key === "total" && total > 0)
    return { tone: "soft", label: `${formatShare(active, total)} active` };
  if (key === "expiringSoon" && stats.expiringSoonNoAutoRenewal > 0)
    return { tone: "warn", label: `${stats.expiringSoonNoAutoRenewal} without auto-renewal` };
  if (key === "expired" && stats.expiredNotRenewed > 0)
    return { tone: "bad", label: `${stats.expiredNotRenewed} not renewed` };
  if (key === "revoked" && revoked > 0) return { tone: "outline", label: "Action required" };
  return null;
};

export const KpiCards = ({ stats }: { stats: TDashboardStats }) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  return (
    <Grid gap={16} min="tile">
      {cards.map((card) => {
        const badge = badgeFor(card.key, stats);
        return (
          <Card
            key={card.key}
            className="relative"
            title={
              <CardLink
                to="/v4/organizations/$orgId/cert-manager/inventory"
                params={{ orgId }}
                search={card.filters}
              >
                {card.label}
              </CardLink>
            }
            action={<Icon name={card.icon} />}
          >
            <Stack gap={8}>
              <Inline gap={8} align="end">
                <Heading level={3} size="display">
                  {stats.totals[card.key]}
                </Heading>
                {card.subtitle && <Meta>{card.subtitle}</Meta>}
              </Inline>
              {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
};
