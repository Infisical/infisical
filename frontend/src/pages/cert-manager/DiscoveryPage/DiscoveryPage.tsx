import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DocumentationLinkBadge,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { CertManagerAdminOnly } from "@app/pages/cert-manager/components/CertManagerAdminOnly";

import { PkiDocsUrls } from "../pki-docs-urls";
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
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Discovery" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title={
            <span className="inline-flex items-center gap-x-2">
              Certificate Discovery
              <span className="mt-0.5">
                <DocumentationLinkBadge href={PkiDocsUrls.discovery.overview} />
              </span>
            </span>
          }
          description="Discover and track SSL/TLS certificates across your infrastructure."
        />
        <CertManagerAdminOnly>
          <Tabs value={activeTab} onValueChange={onTabChange}>
            <TabsList variant="project" aria-label="Certificate discovery sections">
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="installations">Installations</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs">
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionPkiDiscoveryActions.Read}
                a={ProjectPermissionSub.PkiDiscovery}
              >
                <DiscoveryJobsTab projectId={currentProject?.id || ""} />
              </ProjectPermissionCan>
            </TabsContent>
            <TabsContent value="installations">
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionPkiCertificateInstallationActions.Read}
                a={ProjectPermissionSub.PkiCertificateInstallations}
              >
                <InstallationsTab projectId={currentProject?.id || ""} />
              </ProjectPermissionCan>
            </TabsContent>
          </Tabs>
        </CertManagerAdminOnly>
      </div>
    </div>
  );
};
