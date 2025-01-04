import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PersonalTabGroup } from "./components/PersonalTabGroup";

export const PersonalSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.personal.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 px-6 text-white">
        <div className="w-full max-w-6xl">
          <div className="mb-6 mt-6">
            <p className="text-3xl font-semibold text-gray-200">{t("settings.personal.title")}</p>
          </div>
          <PersonalTabGroup />
        </div>
      </div>
    </div>
  );
};
