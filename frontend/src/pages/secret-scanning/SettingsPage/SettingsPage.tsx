import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { LookingForOrgPageLink } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-page text-foreground-inverse">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SecretScanning}
          title="Project Settings"
          description="Configure your Secret Scanning product's configurations."
        >
          <LookingForOrgPageLink page="settings" />
        </PageHeader>
        <ProjectGeneralTab />
      </div>
    </div>
  );
};
