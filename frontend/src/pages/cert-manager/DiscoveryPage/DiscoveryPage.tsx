import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
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
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/"
  });

  const activeTab = selectedTab || "jobs";

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
        <div>
          {activeTab === "jobs" && (
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionPkiDiscoveryActions.Read}
              a={ProjectPermissionSub.PkiDiscovery}
            >
              <DiscoveryJobsTab projectId={currentProject?.id || ""} />
            </ProjectPermissionCan>
          )}
          {activeTab === "installations" && (
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionPkiCertificateInstallationActions.Read}
              a={ProjectPermissionSub.PkiCertificateInstallations}
            >
              <InstallationsTab projectId={currentProject?.id || ""} />
            </ProjectPermissionCan>
          )}
        </div>
      </div>
    </div>
  );
};
