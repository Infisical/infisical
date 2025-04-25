import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { PkiAlertsSection } from "./components";

export const AlertingPage = () => {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Alerting" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader title="Alerting" />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionActions.Read}
          a={ProjectPermissionSub.PkiAlerts}
        >
          <PkiAlertsSection />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
