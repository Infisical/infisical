import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificateProfilesTab } from "./components/CertificateProfilesTab";
import { CertificateTemplatesV2Tab } from "./components/CertificateTemplatesV2Tab";

enum TabSections {
  CertificateProfiles = "profiles",
  CertificateTemplatesV2 = "templates-v2"
}

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState(TabSections.CertificateProfiles);

  if (!currentProject) {
    return <ContentLoader />;
  }

  return (
    <ProjectPermissionCan
      I={ProjectPermissionActions.Read}
      a={ProjectPermissionSub.CertificateAuthorities}
    >
      {(isAllowed) => {
        if (!isAllowed) {
          return (
            <div className="mx-auto flex h-full flex-col justify-center bg-bunker-800 text-white">
              <div className="mx-auto mb-6 w-full max-w-8xl text-center">
                <p>You don&apos;t have permission to access certificate policies.</p>
              </div>
            </div>
          );
        }

        return (
          <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <Helmet>
              <title>{t("common.head-title", { title: "Certificate Policies" })}</title>
            </Helmet>
            <div className="mx-auto mb-6 w-full max-w-8xl">
              <PageHeader
                scope={ProjectType.CertificateManager}
                title="Certificate Policies"
                description="Manage certificate templates and profiles for unified certificate issuance"
              />

              <Tabs orientation="vertical" value={activeTab} onValueChange={(value) => setActiveTab(value as TabSections)}>
                <TabList>
                    <Tab variant="project" value={TabSections.CertificateProfiles}>
                      Certificate Profiles
                    </Tab>
                    <Tab variant="project" value={TabSections.CertificateTemplatesV2}>
                      Certificate Templates
                    </Tab>
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
      }}
    </ProjectPermissionCan>
  );
};
