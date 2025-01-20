import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader title={t("settings.org.title")} />
          <OrgTabGroup />
        </div>
      </div>
    </>
  );
};
