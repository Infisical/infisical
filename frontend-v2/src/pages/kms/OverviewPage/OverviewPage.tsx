import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { CmekTable } from "./components";

export const OverviewPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "KMS" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
          <p className="mr-4 text-3xl font-semibold text-white">Key Management System</p>
          <p className="text-md mb-4 text-bunker-300">
            Manage keys and perform cryptographic operations.
          </p>
          <ProjectPermissionCan
            passThrough={false}
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
