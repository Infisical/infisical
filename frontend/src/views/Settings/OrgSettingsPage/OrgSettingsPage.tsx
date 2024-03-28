import { useTranslation } from "react-i18next";

import { OrgTabGroup } from "./components";

export const OrgSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex w-full justify-center bg-bunker-800 py-6 text-white">
      <div className="w-full max-w-4xl px-6">
        <div className="mb-4">
          <p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
        </div>
        <OrgTabGroup />
      </div>
    </div>
  );
};
