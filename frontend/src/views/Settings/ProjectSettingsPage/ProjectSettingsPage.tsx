import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Tab } from "@headlessui/react";

import { ProjectGeneralTab } from "./components/ProjectGeneralTab";
import { WebhooksTab } from "./components/WebhooksTab";

const tabs = [
  { name: "General", key: "tab-project-general" },
  { name: "Webhooks", key: "tab-project-webhooks" }
];

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center w-full h-full bg-bunker-800 text-white">
      <div className="max-w-7xl px-6 w-full">
        <div className="my-6">
          <p className="text-3xl font-semibold text-gray-200">{t("settings.project.title")}</p>
        </div>
        <Tab.Group>
          <Tab.List className="mb-4 w-full border-b-2 border-mineshaft-800">
            {tabs.map((tab) => (
              <Tab as={Fragment} key={tab.key}>
                {({ selected }) => (
                  <button
                    type="button"
                    className={`w-30 py-2 mx-2 mr-4 font-medium text-sm outline-none ${
                      selected ? "border-b border-white text-white" : "text-mineshaft-400"
                    }`}
                  >
                    {tab.name}
                  </button>
                )}
              </Tab>
            ))}
          </Tab.List>
          <Tab.Panels>
            <Tab.Panel>
              <ProjectGeneralTab />
            </Tab.Panel>
            <Tab.Panel>
              <WebhooksTab />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
};
