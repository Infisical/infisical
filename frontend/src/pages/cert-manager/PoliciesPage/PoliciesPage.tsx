import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";
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
  const [activeTab, setActiveTab] = useState(TabSections.CertificateProfiles);

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
            <CertificateProfilesTab />
          </TabPanel>

          <TabPanel value={TabSections.CertificateTemplatesV2}>
            <CertificateTemplatesV2Tab />
          </TabPanel>

          <TabPanel value={TabSections.Certificates}>
            <CertificatesTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
