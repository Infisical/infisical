import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { PageLoader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { CertManagerAdminOnly } from "@app/pages/cert-manager/components/CertManagerAdminOnly";

import type { FilterRule } from "../CertificatesPage/components/inventory-types";
import { CertificatesTab } from "../PoliciesPage/components/CertificatesTab";

export const InventoryPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const searchParams = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/inventory"
  });

  const dashboardFilters = useMemo<FilterRule[]>(() => {
    const filters: FilterRule[] = [];
    if (searchParams.filterStatus) {
      filters.push({
        id: "dash-status",
        field: "status",
        operator: "in",
        value: [searchParams.filterStatus]
      });
    }
    if (searchParams.filterEnrollmentType) {
      filters.push({
        id: "dash-enrollment",
        field: "enrollmentType",
        operator: "in",
        value: [searchParams.filterEnrollmentType]
      });
    }
    if (searchParams.filterKeyAlgorithm) {
      filters.push({
        id: "dash-algorithm",
        field: "keyAlgorithm",
        operator: "is",
        value: searchParams.filterKeyAlgorithm
      });
    }
    if (searchParams.filterCaId) {
      filters.push({
        id: "dash-ca",
        field: "caId",
        operator: "in",
        value: [searchParams.filterCaId]
      });
    }
    if (searchParams.filterExpiresDays) {
      const days = Number(searchParams.filterExpiresDays);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      filters.push({
        id: "dash-expires",
        field: "notAfter",
        operator: "before",
        value: futureDate.toISOString().split("T")[0]
      });
    }
    if (searchParams.filterExpiresAfterDays) {
      const days = Number(searchParams.filterExpiresAfterDays);
      const afterDate = new Date();
      afterDate.setDate(afterDate.getDate() + days);
      filters.push({
        id: "dash-expires-after",
        field: "notAfter",
        operator: "after",
        value: afterDate.toISOString().split("T")[0]
      });
    }
    return filters;
  }, [searchParams]);

  const canReadCertificates = permission.can(
    ProjectPermissionCertificateActions.Read,
    ProjectPermissionSub.Certificates
  );

  if (!currentProject) {
    return <PageLoader />;
  }

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Inventory" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Inventory"
          description="Filter, view, and inspect all certificates across your infrastructure."
        />
        <CertManagerAdminOnly>
          {canReadCertificates ? (
            <CertificatesTab
              dashboardFilters={dashboardFilters}
              dashboardViewId={searchParams.viewId}
            />
          ) : (
            <PermissionDeniedBanner />
          )}
        </CertManagerAdminOnly>
      </div>
    </div>
  );
};
