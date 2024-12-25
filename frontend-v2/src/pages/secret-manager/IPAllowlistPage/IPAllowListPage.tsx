import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { IPAllowlistSection } from "./components";

export const IPAllowListPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="my-6">
            <p className="text-3xl font-semibold text-gray-200">IP Allowlist</p>
            <div />
          </div>
          <ProjectPermissionCan
            passThrough={false}
            renderGuardBanner
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.IpAllowList}
          >
            <IPAllowlistSection />
          </ProjectPermissionCan>
        </div>
      </div>
    </>
  );
};
