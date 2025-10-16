import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";

import { CertificateProfilesTab } from "./components/CertificateProfilesTab";
import { CertificateTemplatesV2Tab } from "./components/CertificateTemplatesV2Tab";

enum TabSections {
  CertificateTemplatesV2 = "templates-v2",
  CertificateProfiles = "profiles"
}

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState(TabSections.CertificateProfiles);

  if (!currentProject) {
    return <ContentLoader />;
  }

  return (
    <div className="container mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Policies" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader
          scope="project"
          title="Certificate Policies"
          description="Manage certificate templates and profiles for unified certificate issuance"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabSections)}>
          <TabList className="mb-6 w-full">
            <div className="flex w-full border-b border-mineshaft-600">
              <Tab value={TabSections.CertificateProfiles}>Certificate Profiles</Tab>
              <Tab value={TabSections.CertificateTemplatesV2}>Certificate Templates</Tab>
            </div>
          </TabList>

          <TabPanel value={TabSections.CertificateProfiles}>
            <CertificateProfilesTab />
          </TabPanel>

          <TabPanel value={TabSections.CertificateTemplatesV2}>
            <CertificateTemplatesV2Tab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
