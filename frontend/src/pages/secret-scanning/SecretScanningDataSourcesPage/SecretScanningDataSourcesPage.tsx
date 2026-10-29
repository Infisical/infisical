import { useTranslation } from "react-i18next";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SecretScanningDataSourcesSection } from "./components";

export const SecretScanningDataSourcesPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle title={t("page-titles.secret-scanning-data-sources")} />
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionSecretScanningDataSourceActions.Read}
        a={ProjectPermissionSub.SecretScanningDataSources}
      >
        <div className="h-full bg-page">
          <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
            <div className="mx-auto mb-6 w-full max-w-8xl">
              <PageHeader
                scope={ProjectType.SecretScanning}
                title="Data Sources"
                description="Connected systems Secret Scanning reads from."
              />
              <SecretScanningDataSourcesSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
