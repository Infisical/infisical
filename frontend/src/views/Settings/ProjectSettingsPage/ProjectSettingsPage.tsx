import { useTranslation } from "react-i18next";

import { ProjectTabGroup } from "./components";

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center w-full h-full bg-bunker-800 text-white">
      <div className="max-w-4xl px-6 w-full">
        <div className="my-6">
          <p className="text-3xl font-semibold text-gray-200">{t("settings.project.title")}</p>
        </div>
        <ProjectTabGroup />
      </div>
    </div>
  );
};
