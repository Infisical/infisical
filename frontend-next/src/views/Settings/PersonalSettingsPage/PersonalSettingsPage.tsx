import { useTranslation } from "react-i18next";

import { PersonalTabGroup } from "./PersonalTabGroup";

export const PersonalSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex w-full justify-center bg-bunker-800 px-6 text-white">
      <div className="w-full max-w-6xl">
        <div className="mt-6 mb-6">
          <p className="text-3xl font-semibold text-gray-200">{t("settings.personal.title")}</p>
        </div>
        <PersonalTabGroup />
      </div>
    </div>
  );
};
