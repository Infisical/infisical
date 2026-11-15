import { useTranslation } from "react-i18next";

import { PageTitle } from "@app/components/PageTitle";
import { LookingForOrgPageLink } from "@app/components/v3";
import { PageHeader } from "@app/components/v3/platform";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-page text-foreground-inverse">
      <PageTitle title={t("settings.project.title")} />
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.KMS}
          title="Project Settings"
          description="Configure general project settings"
        >
          <LookingForOrgPageLink page="settings" />
        </PageHeader>
        <div className="grow rounded-br-md rounded-bl-md pb-5 outline-hidden xl:overflow-x-hidden xl:pb-0">
          <ProjectGeneralTab />
        </div>
      </div>
    </div>
  );
};
