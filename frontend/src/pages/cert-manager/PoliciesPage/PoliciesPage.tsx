import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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
  CertificateRequests = "certificate-requests",
  PkiCollections = "pki-collections"
}

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [activeTab, setActiveTab] = useState(TabSections.Certificates);
  const [certificateFilter, setCertificateFilter] = useState<{ search?: string }>({});

  const handleViewCertificateFromRequest = (certificateId: string) => {
    setActiveTab(TabSections.Certificates);
    setCertificateFilter({ search: certificateId });
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

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabSections)}
        >
          <TabList>
            <Tab variant="project" value={TabSections.Certificates}>
              Certificates
            </Tab>
            <Tab variant="project" value={TabSections.CertificateRequests}>
              Certificate Requests
            </Tab>
            <Tab variant="project" value={TabSections.CertificateProfiles}>
              Certificate Profiles
            </Tab>
            <Tab variant="project" value={TabSections.CertificatePolicies}>
              Certificate Policies
            </Tab>
          </TabList>

          <TabPanel value={TabSections.Certificates}>
            {canReadCertificates ? (
              <CertificatesTab externalFilter={certificateFilter} />
            ) : (
              <PermissionDeniedBanner />
            )}
          </TabPanel>

          <TabPanel value={TabSections.CertificateRequests}>
            {canReadCertificates ? (
              <CertificateRequestsTab
                onViewCertificateFromRequest={handleViewCertificateFromRequest}
              />
            ) : (
              <PermissionDeniedBanner />
            )}
          </TabPanel>

          <TabPanel value={TabSections.CertificateProfiles}>
            {canReadCertificateProfiles ? <CertificateProfilesTab /> : <PermissionDeniedBanner />}
          </TabPanel>

          <TabPanel value={TabSections.CertificatePolicies}>
            {canReadCertificatePolicies ? <CertificatePoliciesTab /> : <PermissionDeniedBanner />}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
