import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";

import { PamAccountsSection } from "./components/PamAccountsSection";

export const PamAccountsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionPamAccountActions.Read}
        a={ProjectPermissionSub.PamAccounts}
      >
        <div className="h-full bg-bunker-800">
          <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-7xl">
              <PageHeader
                scope="project"
                title="Accounts"
                description="View, access, and manage accounts."
              />
              <PamAccountsSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
