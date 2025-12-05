import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificateProfilesTab } from "./components/CertificateProfilesTab";
import { CertificatesTab } from "./components/CertificatesTab";
import { CertificateTemplatesV2Tab } from "./components/CertificateTemplatesV2Tab";

enum TabSections {
  CertificateProfiles = "profiles",
  CertificateTemplatesV2 = "templates-v2",
  Certificates = "certificates",
  PkiCollections = "pki-collections"
}

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [activeTab, setActiveTab] = useState(TabSections.CertificateProfiles);

  const canReadCertificateProfiles = permission.can(
    ProjectPermissionCertificateProfileActions.Read,
    ProjectPermissionSub.CertificateProfiles
  );
  const canReadCertificateTemplates = permission.can(
    ProjectPermissionPkiTemplateActions.Read,
    ProjectPermissionSub.CertificateTemplates
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
        <title>{t("common.head-title", { title: "Certificate Management" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Management"
          description="Streamline certificate management by creating and maintaining templates, profiles, and certificates in one place"
        />

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabSections)}
        >
          <TabList>
            <Tab variant="project" value={TabSections.CertificateProfiles}>
              Certificate Profiles
            </Tab>
            <Tab variant="project" value={TabSections.CertificateTemplatesV2}>
              Certificate Templates
            </Tab>
            <Tab variant="project" value={TabSections.Certificates}>
              Certificates
            </Tab>
          </TabList>

          <TabPanel value={TabSections.CertificateProfiles}>
            {canReadCertificateProfiles ? <CertificateProfilesTab /> : <PermissionDeniedBanner />}
          </TabPanel>

          <TabPanel value={TabSections.CertificateTemplatesV2}>
            {canReadCertificateTemplates ? (
              <CertificateTemplatesV2Tab />
            ) : (
              <PermissionDeniedBanner />
            )}
          </TabPanel>

          <TabPanel value={TabSections.Certificates}>
            {canReadCertificates ? <CertificatesTab /> : <PermissionDeniedBanner />}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
