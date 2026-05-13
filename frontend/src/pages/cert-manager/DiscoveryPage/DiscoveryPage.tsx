import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

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
import { CertManagerAdminOnly } from "@app/pages/cert-manager/components/CertManagerAdminOnly";

import { DiscoveryJobsTab, InstallationsTab } from "./components";

export const DiscoveryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { orgId, projectId } = useParams({ strict: false });
  const { currentProject } = useProject();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/"
  });

  const activeTab = selectedTab || "jobs";

  const onTabChange = (value: string) => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery",
      params: { orgId: orgId ?? "", projectId: projectId ?? "" },
      search: { selectedTab: value }
    });
  };

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
        <CertManagerAdminOnly>
          <Tabs value={activeTab} onValueChange={onTabChange}>
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
        </CertManagerAdminOnly>
      </div>
    </div>
  );
};
