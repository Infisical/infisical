import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { CmekTable } from "./components";

export const OverviewPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "KMS" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Overview Page"
            description="Manage keys and perform cryptographic operations."
          />
          <ProjectPermissionCan
            renderGuardBanner
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.Cmek}
          >
            <CmekTable />
          </ProjectPermissionCan>
        </div>
      </div>
    </div>
  );
};
