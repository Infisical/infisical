import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, PageLoader } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  useGetCertActivityTrend,
  useGetCertDashboardStats,
  useGetCertPqcTrend
} from "@app/hooks/api/certificates";
import { ProjectType } from "@app/hooks/api/projects/types";
import { CertManagerAdminOnly } from "@app/pages/cert-manager/components/CertManagerAdminOnly";

import { getInventoryLink, type InventoryFilters } from "./components/inventory-link";
import {
  ActivityTrend,
  CodeSigningSection,
  DistributionCharts,
  ExpirationTimeline,
  KpiCards,
  PqcReadinessChart,
  PqcTrend,
  ValidityReadinessSection
} from "./components";

export const DashboardPage = () => {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [trendRange, setTrendRange] = useState("30d");
  const [pqcTrendRange, setPqcTrendRange] = useState("30d");
  const { data: stats, isPending: isStatsLoading } = useGetCertDashboardStats(
    currentProject?.id || ""
  );
  const { data: trendData } = useGetCertActivityTrend(currentProject?.id || "", trendRange);
  const { data: pqcTrendData } = useGetCertPqcTrend(currentProject?.id || "", pqcTrendRange);
  const getLink = useCallback(
    (filters: InventoryFilters) => getInventoryLink(currentProject, filters),
    [currentProject]
  );
  const navigateToInventory = useCallback(
    (filters: InventoryFilters) =>
      navigate({
        to: "/organizations/$orgId/cert-manager/inventory",
        params: { orgId: currentProject?.orgId || "" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: filters as any
      }),
    [navigate, currentProject?.orgId]
  );
  if (!currentProject) {
    return (
      <>
        <PageTitle title="Certificate Dashboard" />
        <PageLoader />
      </>
    );
  }
  return (
    <div className="h-full bg-page">
      <PageTitle title="Certificate Dashboard" />
      <div className="mx-auto flex flex-col text-foreground-inverse">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope={ProjectType.CertificateManager}
            title="Certificate Dashboard"
            description="See the overall state of your certificates at a glance."
          />
          <CertManagerAdminOnly>
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionCertificateActions.Read}
              a={ProjectPermissionSub.Certificates}
            >
              {isStatsLoading || !stats ? (
                <PageLoader />
              ) : (
                <div className="flex flex-col gap-6">
                  <KpiCards stats={stats} getLink={getLink} />
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <DistributionCharts
                      stats={stats}
                      getLink={getLink}
                      onNavigate={navigateToInventory}
                    />
                    <ExpirationTimeline
                      buckets={stats.expirationBuckets}
                      getLink={getLink}
                      onNavigate={navigateToInventory}
                    />
                  </div>
                  <CodeSigningSection projectId={currentProject.id} />
                  <ActivityTrend
                    data={trendData?.periods || []}
                    currentRange={trendRange}
                    onRangeChange={setTrendRange}
                  />
                  <ValidityReadinessSection stats={stats} />
                  {stats.totals.total > 0 && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-normal text-foreground">
                        Post-Quantum Readiness
                      </h2>
                      <div className="flex flex-wrap gap-4">
                        <PqcReadinessChart
                          stats={stats}
                          getLink={getLink}
                          onNavigate={navigateToInventory}
                        />
                        <PqcTrend
                          data={pqcTrendData?.periods || []}
                          currentRange={pqcTrendRange}
                          onRangeChange={setPqcTrendRange}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ProjectPermissionCan>
          </CertManagerAdminOnly>
        </div>
      </div>
    </div>
  );
};
