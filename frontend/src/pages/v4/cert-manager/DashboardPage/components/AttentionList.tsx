import type { MouseEvent } from "react";
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";

import { Badge } from "@app/components/v4/ui/badge";
import { Inline } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { StatusText } from "@app/components/v4/ui/text";
import type { TDashboardStats } from "@app/hooks/api/certificates/types";

import type { InventoryFilters } from "./dashboard.utils";

const inventory = "/v4/organizations/$orgId/cert-manager/inventory";

type AttentionItem = {
  key: string;
  label: string;
  count: number;
  filters: InventoryFilters;
  badges: { tone: "bad" | "warn"; label: string }[];
};

const attentionItems = (stats: TDashboardStats): AttentionItem[] => {
  const withinWeek = stats.expirationBuckets
    .filter((entry) => entry.bucket === "expired" || entry.bucket === "0-7d")
    .reduce((sum, entry) => sum + entry.count, 0);
  const items: AttentionItem[] = [
    {
      key: "expiring",
      label: "Expiring within 30 days",
      count: stats.totals.expiringSoon,
      filters: { filterStatus: "active", filterExpiresDays: "30" },
      badges: [
        ...(withinWeek > 0 ? [{ tone: "bad" as const, label: `${withinWeek} within 7 days` }] : []),
        ...(stats.expiringSoonNoAutoRenewal > 0
          ? [
              {
                tone: "warn" as const,
                label: `${stats.expiringSoonNoAutoRenewal} without auto-renewal`
              }
            ]
          : [])
      ]
    },
    {
      key: "expired",
      label: "Expired and not renewed",
      count: stats.expiredNotRenewed,
      filters: { filterStatus: "expired" },
      badges: []
    }
  ];
  return items.filter((item) => item.count > 0);
};

export const AttentionList = ({ stats }: { stats: TDashboardStats }) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const router = useRouter();
  const navigate = useNavigate();
  const items = attentionItems(stats);

  if (items.length === 0)
    return (
      <StatusText tone="ok" icon="check-c">
        No certificates need attention
      </StatusText>
    );

  const open = (event: MouseEvent, filters: InventoryFilters) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate({ to: inventory, params: { orgId }, search: filters });
  };

  return (
    <List
      label="Needs attention"
      title="Needs attention"
      count={items.reduce((sum, item) => sum + item.count, 0)}
    >
      {items.map((item) => (
        <ListRow
          key={item.key}
          value={item.key}
          label={item.label}
          title={item.label}
          href={
            router.buildLocation({ to: inventory, params: { orgId }, search: item.filters }).href
          }
          onClick={(event) => open(event, item.filters)}
          meta={item.count}
          badge={
            item.badges.length > 0 && (
              <Inline gap={8} wrap={false}>
                {item.badges.map((badge) => (
                  <Badge key={badge.label} tone={badge.tone}>
                    {badge.label}
                  </Badge>
                ))}
              </Inline>
            )
          }
        />
      ))}
    </List>
  );
};
