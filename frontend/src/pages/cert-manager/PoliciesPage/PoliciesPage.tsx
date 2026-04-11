import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { ContentLoader, PageHeader } from "@app/components/v2";
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
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/policies"
  });

  const activeTab = (selectedTab as TabSections) || TabSections.Certificates;
  const [certificateFilter, setCertificateFilter] = useState<{ search?: string }>({});

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
    return <ContentLoader />;
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
              <CertificatesTab externalFilter={certificateFilter} />
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
