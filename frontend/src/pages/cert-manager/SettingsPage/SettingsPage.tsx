import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { CertificateCleanupTab } from "./components/CertificateCleanupTab";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/settings"
  });

  const activeTab = selectedTab || "general";

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader scope={ProjectType.CertificateManager} title={t("settings.project.title")}>
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentOrg.id
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for {isSubOrganization ? "sub-" : ""}organization
            settings?
          </Link>
        </PageHeader>
        <div>
          {activeTab === "general" && <ProjectGeneralTab />}
          {activeTab === "certificate-cleanup" && <CertificateCleanupTab />}
        </div>
      </div>
    </div>
  );
};
