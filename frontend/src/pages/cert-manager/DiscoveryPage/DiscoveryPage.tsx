import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DiscoveryJobsTab, InstallationsTab } from "./components";

export const DiscoveryPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [selectedTab, setSelectedTab] = useState("jobs");

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Discovery" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title={
            <span className="inline-flex items-center gap-x-2">
              Certificate Discovery
              <span className="mt-0.5">
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/discovery" />
              </span>
            </span>
          }
          description="Discover and track SSL/TLS certificates across your infrastructure."
        />
        <Tabs orientation="vertical" value={selectedTab} onValueChange={setSelectedTab}>
          <TabList>
            <Tab variant="project" value="jobs">
              Jobs
            </Tab>
            <Tab variant="project" value="installations">
              Installations
            </Tab>
          </TabList>

          <TabPanel value="jobs">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionPkiDiscoveryActions.Read}
              a={ProjectPermissionSub.PkiDiscovery}
            >
              <DiscoveryJobsTab projectId={currentProject?.id || ""} />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="installations">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionPkiCertificateInstallationActions.Read}
              a={ProjectPermissionSub.PkiCertificateInstallations}
            >
              <InstallationsTab projectId={currentProject?.id || ""} />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
