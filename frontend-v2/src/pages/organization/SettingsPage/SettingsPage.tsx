import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 py-6 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="mb-4">
            <p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
          </div>
          <OrgTabGroup />
        </div>
      </div>
    </>
  );
};
