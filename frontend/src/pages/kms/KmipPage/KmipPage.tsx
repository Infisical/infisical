import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

export const KmipPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "KMS" })}</title>
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title="KMIP clients" description="Manage KMIP clients" />
          <ProjectPermissionCan
            passThrough={false}
            renderGuardBanner
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.Cmek}
          >
            <div>KMIP clients here</div>
          </ProjectPermissionCan>
        </div>
      </div>
    </div>
  );
};
