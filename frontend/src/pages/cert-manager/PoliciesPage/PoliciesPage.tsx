import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { PageLoader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificatePoliciesTab } from "./components/CertificatePoliciesTab";
import { CertificateProfilesTab } from "./components/CertificateProfilesTab";
import { CertificateRequestsTab } from "./components/CertificateRequestsTab";
import { CertificatesTab } from "./components/CertificatesTab";

enum TabSections {
  CertificateProfiles = "profiles",
  CertificatePolicies = "policies",
  Certificates = "certificates",
  CertificateRequests = "certificate-requests"
}

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const navigate = useNavigate();
  const searchParams = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/policies"
  });

  const activeTab = (searchParams.selectedTab as TabSections) || TabSections.Certificates;
  const [certificateFilter, setCertificateFilter] = useState<{ search?: string }>({});

  const dashboardFilters = useMemo(() => {
    const filters: Array<{
      id: string;
      field: string;
      operator: string;
      value: string | string[];
    }> = [];
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

  const handleViewCertificateFromRequest = (certificateId: string) => {
    setCertificateFilter({ search: certificateId });
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: { selectedTab: TabSections.Certificates } as any
    });
  };

  const canReadCertificateProfiles = permission.can(
    ProjectPermissionCertificateProfileActions.Read,
    ProjectPermissionSub.CertificateProfiles
  );
  const canReadCertificatePolicies = permission.can(
    ProjectPermissionCertificatePolicyActions.Read,
    ProjectPermissionSub.CertificatePolicies
  );
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
        <title>{t("common.head-title", { title: "Certificate Manager" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Manager"
          description="Streamline certificate management by creating and maintaining templates, profiles, and certificates in one place"
        />
        <div>
          {activeTab === TabSections.Certificates &&
            (canReadCertificates ? (
              <CertificatesTab
                externalFilter={certificateFilter}
                dashboardFilters={dashboardFilters}
                dashboardViewId={searchParams.viewId}
              />
            ) : (
              <PermissionDeniedBanner />
            ))}
          {activeTab === TabSections.CertificateRequests &&
            (canReadCertificates ? (
              <CertificateRequestsTab
                onViewCertificateFromRequest={handleViewCertificateFromRequest}
              />
            ) : (
              <PermissionDeniedBanner />
            ))}
          {activeTab === TabSections.CertificateProfiles &&
            (canReadCertificateProfiles ? <CertificateProfilesTab /> : <PermissionDeniedBanner />)}
          {activeTab === TabSections.CertificatePolicies &&
            (canReadCertificatePolicies ? <CertificatePoliciesTab /> : <PermissionDeniedBanner />)}
        </div>
      </div>
    </div>
  );
};
