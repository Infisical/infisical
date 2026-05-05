import { useQuery } from "@tanstack/react-query";
import { FileCheckIcon, FileClockIcon, HourglassIcon, UsersIcon } from "lucide-react";

import { Card, CardContent, Skeleton } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { TPkiApplication, TPkiApplicationMember } from "@app/hooks/api/pkiApplications";

type Props = {
  application: TPkiApplication;
  members: TPkiApplicationMember[];
  projectId: string;
};

type StatTone = "success" | "warning" | "danger" | "neutral";

type StatCardProps = {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: StatTone;
};

const TONE_BG: Record<StatTone, string> = {
  success: "bg-success/10 border-success/20",
  warning: "bg-warning/10 border-warning/20",
  danger: "bg-danger/10 border-danger/20",
  neutral: "bg-neutral/10 border-neutral/20"
};

const TONE_ICON: Record<StatTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-neutral"
};

const StatCard = ({ label, value, isLoading, hint, icon: Icon, tone }: StatCardProps) => (
  <Card className="h-auto min-w-[180px] flex-1 gap-0 p-0">
    <CardContent className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-base font-semibold text-foreground">{label}</span>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${TONE_BG[tone]}`}
        >
          <Icon className={`h-[18px] w-[18px] ${TONE_ICON[tone]}`} />
        </div>
      </div>
      <div className="mt-auto pt-6">
        <div className="flex items-baseline gap-2">
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <span className="text-3xl font-semibold text-foreground">{value ?? 0}</span>
          )}
          {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        </div>
      </div>
    </CardContent>
  </Card>
);

export const ApplicationOverviewTab = ({ application, members, projectId }: Props) => {
  const { data: activeCerts, isPending: isActivePending } = useQuery({
    queryKey: [
      "application-overview-active",
      { projectId, applicationId: application.id }
    ] as const,
    queryFn: async () => {
      const { data } = await apiRequest.post<{ totalCount: number }>(
        `/api/v1/projects/${projectId}/certificates/search`,
        { offset: 0, limit: 1, applicationId: application.id, status: "active" }
      );
      return data.totalCount;
    },
    enabled: Boolean(projectId && application.id)
  });

  const expiringCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiringCount, isPending: isExpiringPending } = useQuery({
    queryKey: [
      "application-overview-expiring",
      { projectId, applicationId: application.id }
    ] as const,
    queryFn: async () => {
      const { data } = await apiRequest.post<{ totalCount: number }>(
        `/api/v1/projects/${projectId}/certificates/search`,
        {
          offset: 0,
          limit: 1,
          applicationId: application.id,
          status: "active",
          notAfterTo: expiringCutoff
        }
      );
      return data.totalCount;
    },
    enabled: Boolean(projectId && application.id)
  });

  const { data: pendingApprovals, isPending: isPendingApprovalsPending } = useQuery({
    queryKey: [
      "application-overview-pending",
      { projectId, applicationId: application.id }
    ] as const,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ requests: Array<{ status: string }> }>(
        "/api/v1/cert-request-policies/requests",
        { params: { projectId, applicationId: application.id } }
      );
      return data.requests.filter((r) => r.status === "pending").length;
    },
    enabled: Boolean(projectId && application.id)
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Active certificates"
          value={activeCerts}
          isLoading={isActivePending}
          hint="Issued via this Application"
          icon={FileCheckIcon}
          tone="success"
        />
        <StatCard
          label="Expiring in 30d"
          value={expiringCount}
          isLoading={isExpiringPending}
          hint="Active, expiring within 30 days"
          icon={FileClockIcon}
          tone={expiringCount && expiringCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Pending approvals"
          value={pendingApprovals}
          isLoading={isPendingApprovalsPending}
          hint="Gated by an Application policy"
          icon={HourglassIcon}
          tone={pendingApprovals && pendingApprovals > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Members"
          value={members.length}
          isLoading={false}
          hint="Users, identities, and groups"
          icon={UsersIcon}
          tone="neutral"
        />
      </div>
    </div>
  );
};
