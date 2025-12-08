import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CmekTable } from "./components";

export const OverviewPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "KMS" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.KMS}
            title="Project Overview"
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
