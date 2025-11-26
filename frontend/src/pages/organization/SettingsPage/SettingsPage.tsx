import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";

import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { isSubOrganization } = useOrganization();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description="Configure organization-wide settings"
            title={isSubOrganization ? "Sub-Organization Settings" : "Organization Settings"}
          />
          <OrgTabGroup />
        </div>
      </div>
    </>
  );
};
