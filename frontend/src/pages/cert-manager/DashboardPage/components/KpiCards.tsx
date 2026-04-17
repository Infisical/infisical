import { AlertTriangle, FileCheck, FileClock, FileKey, FileX } from "lucide-react";

import { Badge, UnstableCard, UnstableCardContent } from "@app/components/v3";
import type { TDashboardStats } from "@app/hooks/api/certificates";

type Props = {
  stats: TDashboardStats;
  onNavigate: (filters: Record<string, string | undefined>) => void;
};

const cards = [
  {
    key: "total" as const,
    label: "Total Certificates",
    subtitle: "All certificates",
    icon: FileKey,
    iconClass: "text-org",
    iconBg: "bg-org/10 border-org/20",
    filters: {} as Record<string, string>
  },
  {
    key: "active" as const,
    label: "Active",
    subtitle: "Currently valid",
    icon: FileCheck,
    iconClass: "text-success",
    iconBg: "bg-success/10 border-success/20",
    filters: { filterStatus: "active" }
  },
  {
    key: "expiringSoon" as const,
    label: "Expiring Soon",
    subtitle: "In the next 30 days",
    icon: FileClock,
    iconClass: "text-warning",
    iconBg: "bg-warning/10 border-warning/20",
    filters: { filterStatus: "active", filterExpiresDays: "30" }
  },
  {
    key: "expired" as const,
    label: "Expired",
    subtitle: "Past validity",
    icon: FileX,
    iconClass: "text-danger",
    iconBg: "bg-danger/10 border-danger/20",
    filters: { filterStatus: "expired" }
  },
  {
    key: "revoked" as const,
    label: "Revoked",
    subtitle: "Manually revoked",
    icon: AlertTriangle,
    iconClass: "text-neutral",
    iconBg: "bg-neutral/10 border-neutral/20",
    filters: { filterStatus: "revoked" }
  }
];

const getBadge = (key: string, stats: TDashboardStats) => {
  const { total, active } = stats.totals;

  if (key === "total" && total > 0) {
    const pct = Math.round((active / total) * 100);
    return {
      variant: "org" as const,
      label: `${pct}% active`
    };
  }
  if (key === "active" && total > 0) {
    return {
      variant: "success" as const,
      label: "valid & trusted"
    };
  }
  if (key === "expiringSoon" && stats.expiringSoonNoAutoRenewal > 0) {
    return {
      variant: "warning" as const,
      label: `${stats.expiringSoonNoAutoRenewal} without auto-renewal`
    };
  }
  if (key === "expired" && stats.expiredNotRenewed > 0) {
    return {
      variant: "danger" as const,
      label: `${stats.expiredNotRenewed} not renewed`
    };
  }
  if (key === "revoked" && stats.totals.revoked > 0) {
    return {
      variant: "neutral" as const,
      label: "action required"
    };
  }
  return null;
};

export const KpiCards = ({ stats, onNavigate }: Props) => {
  return (
    <div className="flex flex-wrap gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const count = stats.totals[card.key];
        const badge = getBadge(card.key, stats);
        return (
          <UnstableCard
            key={card.key}
            className="h-auto min-w-[180px] flex-1 cursor-pointer gap-0 p-0 transition-colors hover:bg-container-hover"
            onClick={() => onNavigate(card.filters)}
          >
            <UnstableCardContent className="flex h-full flex-col p-4">
              <div className="flex items-start justify-between">
                <span className="text-base font-semibold text-foreground">{card.label}</span>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${card.iconBg}`}
                >
                  <Icon className={`h-[18px] w-[18px] ${card.iconClass}`} />
                </div>
              </div>
              <div className="mt-auto pt-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-foreground">{count}</span>
                  <span className="text-xs text-muted">{card.subtitle}</span>
                </div>
                <div className="mt-3 min-h-[22px]">
                  {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                </div>
              </div>
            </UnstableCardContent>
          </UnstableCard>
        );
      })}
    </div>
  );
};
