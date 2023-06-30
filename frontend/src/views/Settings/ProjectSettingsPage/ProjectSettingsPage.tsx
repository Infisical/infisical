import { useTranslation } from "react-i18next";

import NavHeader from "@app/components/navigation/NavHeader";

import { ProjectTabGroup } from "./components";

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center bg-bunker-800 text-white w-full h-full px-6">
      <div className="max-w-screen-lg w-full">
        <div className="relative right-5 ml-4">
          <NavHeader pageName={t("settings.project.title")} isProjectRelated />
        </div>
        <div className="my-8">
            <p className="text-3xl font-semibold text-gray-200">
              {t("settings.project.title")}
            </p>
        </div>
        <ProjectTabGroup />
      </div>
    </div>
  );
};
