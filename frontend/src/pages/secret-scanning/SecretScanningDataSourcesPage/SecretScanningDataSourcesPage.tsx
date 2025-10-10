import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { SecretScanningDataSourcesSection } from "./components";

export const SecretScanningDataSourcesPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Secret Scanning" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionSecretScanningDataSourceActions.Read}
        a={ProjectPermissionSub.SecretScanningDataSources}
      >
        <div className="h-full bg-bunker-800">
          <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-7xl">
              <PageHeader
                title="Data Sources"
                description="Manage your Secret Scanning data sources."
              />
              <SecretScanningDataSourcesSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
