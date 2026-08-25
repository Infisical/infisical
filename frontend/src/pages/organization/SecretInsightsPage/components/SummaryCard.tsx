import { BotIcon, ClockIcon, UsersIcon } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { TOrgSecretsSummary } from "@app/hooks/api";

type StatCardProps = {
  title: string;
  icon: React.ReactNode;
  iconVariant: "info" | "warning" | "danger";
  value: number;
  suffix?: string;
  caption: string;
};

const StatCard = ({ title, icon, iconVariant, value, suffix, caption }: StatCardProps) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardAction>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
            iconVariant === "info" && "border-info/15 bg-info/10 text-info",
            iconVariant === "warning" && "border-warning/15 bg-warning/10 text-warning",
            iconVariant === "danger" && "border-danger/15 bg-danger/10 text-danger"
          )}
        >
          {icon}
        </div>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div>
        <span className="text-2xl font-semibold">{value.toLocaleString()}</span>
        {suffix && <span className="ml-2 text-sm text-muted">{suffix}</span>}
      </div>
      <span className="text-xs text-muted">{caption}</span>
    </CardContent>
  </Card>
);

export const SummaryCard = ({ summary }: { summary: TOrgSecretsSummary }) => (
  <div className="grid gap-4 md:grid-cols-3">
    <StatCard
      title="Dynamic Secrets in Use"
      icon={<ClockIcon />}
      iconVariant="warning"
      value={summary.activeLeases}
      suffix="active leases"
      caption="Leases currently issued across all projects"
    />
    <StatCard
      title="Users"
      icon={<UsersIcon />}
      iconVariant="info"
      value={summary.users}
      caption="Members with access to secrets management projects"
    />
    <StatCard
      title="Machine Identities"
      icon={<BotIcon />}
      iconVariant="info"
      value={summary.identities}
      caption="Identities with access to secrets management projects"
    />
  </div>
);
