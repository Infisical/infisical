import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamSessionActions } from "@app/context/ProjectPermissionContext/types";

import { PamSessionSection } from "./components/PamSessionSection";

export const PamSessionPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionPamSessionActions.Read}
        a={ProjectPermissionSub.PamSessions}
      >
        <div className="h-full bg-bunker-800">
          <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-7xl">
              <PageHeader
                title="Sessions"
                description="Filter and search through account sessions."
              />
              <PamSessionSection />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
