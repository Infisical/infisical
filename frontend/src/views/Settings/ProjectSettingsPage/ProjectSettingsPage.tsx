import { useTranslation } from "react-i18next";

import { ProjectTabGroup } from "./components";

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center bg-bunker-800 text-white w-full">
      <div className="max-w-7xl w-full px-6">
        <div className="mt-6 mb-6">
            <p className="text-3xl font-semibold text-gray-200">
              {t("settings.project.title")}
            </p>
        </div>
        <ProjectTabGroup />
      </div>
    </div>
  );
};
