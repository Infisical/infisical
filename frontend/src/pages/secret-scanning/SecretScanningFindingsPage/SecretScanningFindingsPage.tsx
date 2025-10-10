import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";

import { SecretScanningFindingsSection } from "./components";

export const SecretScanningFindingsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Secret Scanning" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionSecretScanningFindingActions.Read}
        a={ProjectPermissionSub.SecretScanningFindings}
      >
        <div className="h-full bg-bunker-800">
          <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-7xl">
              <PageHeader title="Findings" description="View Secret Leaks across your project." />
              <SecretScanningFindingsSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
