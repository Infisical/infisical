import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  type LucideIcon,
  PlusIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableCard,
  UnstableCardContent,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePageLoader
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetNhiStats, useListNhiSources } from "@app/hooks/api/nhi";
import { NhiScanStatus } from "@app/hooks/api/nhi/types";
import { ProjectType } from "@app/hooks/api/projects/types";

const getRiskBarColor = (score: number) => {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-orange-500";
  if (score >= 20) return "bg-yellow-500";
  return "bg-green-500";
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  color
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) => (
  <UnstableCard>
    <UnstableCardContent>
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${color}`} />
        <span className="text-sm text-mineshaft-300">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </UnstableCardContent>
  </UnstableCard>
);

export const NhiOverviewPage = () => {
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const { data: sources = [], isPending: isSourcesPending } = useListNhiSources(currentProject.id);

  const hasScanningSources = sources.some((s) => s.lastScanStatus === NhiScanStatus.Scanning);

  const { data: stats, isPending: isStatsPending } = useGetNhiStats(currentProject.id, {
    enabled: sources.length > 0,
    refetchInterval: hasScanningSources ? 3000 : false
  });

  if (isSourcesPending) return <UnstablePageLoader />;

  if (sources.length === 0) {
    return (
      <>
        <Helmet>
          <title>Identity - Overview</title>
        </Helmet>
        <PageHeader
          scope={ProjectType.NHI}
          title="Overview"
          description="Discover and govern non-human identities across your cloud infrastructure."
        />
        <UnstableEmpty className="mt-10 p-16">
          <ShieldIcon className="mb-4 size-12 text-mineshaft-400" />
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No cloud sources connected</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Add your first cloud source to start discovering non-human identities.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
          <UnstableEmptyContent>
            <Button
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/projects/nhi/$projectId/sources",
                  params: { orgId: currentProject.orgId, projectId: currentProject.id }
                })
              }
            >
              <PlusIcon size={14} className="mr-1" />
              Add Cloud Source
            </Button>
          </UnstableEmptyContent>
        </UnstableEmpty>
      </>
    );
  }

  if (isStatsPending) return <UnstablePageLoader />;

  return (
    <>
      <Helmet>
        <title>Identity - Overview</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.NHI}
        title="Overview"
        description="Discover and govern non-human identities across your cloud infrastructure."
      />

      <div className="mt-4 grid grid-cols-4 gap-4">
        <StatCard
          label="Total NHIs"
          value={stats?.total ?? 0}
          icon={UsersIcon}
          color="text-primary"
        />
        <StatCard
          label="Critical Risk"
          value={stats?.criticalCount ?? 0}
          icon={AlertTriangleIcon}
          color="text-red-500"
        />
        <StatCard
          label="High Risk"
          value={stats?.highCount ?? 0}
          icon={AlertTriangleIcon}
          color="text-orange-500"
        />
        <StatCard
          label="Unowned"
          value={stats?.unownedCount ?? 0}
          icon={UserIcon}
          color="text-yellow-500"
        />
      </div>

      <UnstableCard className="mt-4">
        <UnstableCardContent>
          <p className="text-sm text-mineshaft-300">
            Average Risk Score:{" "}
            <span className="text-lg font-semibold text-mineshaft-100">
              {stats?.avgRiskScore?.toFixed(1) ?? "0"}
            </span>
            <span className="text-mineshaft-400"> / 100</span>
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-mineshaft-600">
            <div
              className={`h-full rounded-full transition-all ${getRiskBarColor(stats?.avgRiskScore ?? 0)}`}
              style={{ width: `${stats?.avgRiskScore ?? 0}%` }}
            />
          </div>
        </UnstableCardContent>
      </UnstableCard>

      {hasScanningSources && (
        <UnstableAlert variant="info" className="mt-4">
          <UnstableAlertTitle>Scan in progress</UnstableAlertTitle>
          <UnstableAlertDescription>Stats will update automatically.</UnstableAlertDescription>
        </UnstableAlert>
      )}
    </>
  );
};
