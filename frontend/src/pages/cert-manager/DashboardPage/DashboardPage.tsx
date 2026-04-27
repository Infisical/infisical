import { useCallback, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { PageLoader } from "@app/components/v3";
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
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [trendRange, setTrendRange] = useState("30d");
  const [pqcTrendRange, setPqcTrendRange] = useState("30d");
  const { data: stats, isPending: isStatsLoading } = useGetCertDashboardStats(
    currentProject?.id || ""
  );
  const { data: trendData } = useGetCertActivityTrend(currentProject?.id || "", trendRange);
  const { data: pqcTrendData } = useGetCertPqcTrend(currentProject?.id || "", pqcTrendRange);
  const navigateToInventory = useCallback(
    (filters: Record<string, string | undefined>) => {
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/policies",
        params: {
          orgId: currentProject?.orgId || "",
          projectId: currentProject?.id || ""
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: { selectedTab: "certificates", ...filters } as any
      });
    },
    [navigate, currentProject]
  );
  if (!currentProject) {
    return <PageLoader />;
  }
  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Dashboard" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.CertificateManager}
            title="Certificate Dashboard"
            description="At-a-glance view of your certificate estate."
          />
          <ProjectPermissionCan
            renderGuardBanner
            I={ProjectPermissionCertificateActions.Read}
            a={ProjectPermissionSub.Certificates}
          >
            {isStatsLoading || !stats ? (
              <PageLoader />
            ) : (
              <div className="flex flex-col gap-6">
                <KpiCards stats={stats} onNavigate={navigateToInventory} />
                <div className="flex flex-wrap gap-4">
                  <DistributionCharts stats={stats} onNavigate={navigateToInventory} />
                  <ExpirationTimeline
                    buckets={stats.expirationBuckets}
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
                    <h2 className="text-lg font-semibold text-foreground">
                      Post-Quantum Readiness
                    </h2>
                    <div className="flex flex-wrap gap-4">
                      <PqcReadinessChart stats={stats} onNavigate={navigateToInventory} />
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
        </div>
      </div>
    </div>
  );
};
