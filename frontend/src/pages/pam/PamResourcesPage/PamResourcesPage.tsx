import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";

import { PamResourcesSection } from "./components/PamResourcesSection";

export const PamResourcesPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionPamAccountActions.Read}
        a={ProjectPermissionSub.PamResources}
      >
        <div className="h-full bg-bunker-800">
          <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-8xl">
              <PageHeader
                scope="project"
                title="Resources"
                description="Manage resources such as servers, databases, and more."
              />
              <PamResourcesSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
