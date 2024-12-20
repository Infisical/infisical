import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { IPAllowlistSection } from "./-components";

const IPAllowlistPage = withProjectPermission(
  () => {
    return (
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="my-6">
            <p className="text-3xl font-semibold text-gray-200">IP Allowlist</p>
            <div />
          </div>
          <IPAllowlistSection />
        </div>
      </div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.IpAllowList
  }
);

const IPAllowlistRoute = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <IPAllowlistPage />
    </>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/allowlist/"
)({
  component: () => IPAllowlistRoute
});
