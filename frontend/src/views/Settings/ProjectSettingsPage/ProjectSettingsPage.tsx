import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Tab } from "@headlessui/react";

import { useWorkspace } from "@app/context";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { EncryptionTab } from "./components/EncryptionTab";
import { ProjectGeneralTab } from "./components/ProjectGeneralTab";
import { WebhooksTab } from "./components/WebhooksTab";
import { WorkflowIntegrationTab } from "./components/WorkflowIntegrationSection";

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const tabs = [
    { name: "General", key: "tab-project-general" },
    {
      name: "Encryption",
      key: "tab-project-encryption",
      isHidden: currentWorkspace?.version !== ProjectVersion.V3
    },
    { name: "Workflow Integrations", key: "tab-workflow-integrations" },
    { name: "Webhooks", key: "tab-project-webhooks" }
  ];

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <div className="w-full max-w-7xl px-6">
        <div className="my-6">
          <p className="text-3xl font-semibold text-gray-200">{t("settings.project.title")}</p>
        </div>
        <Tab.Group>
          <Tab.List className="mb-4 w-full border-b-2 border-mineshaft-800">
            {tabs
              .filter((el) => !el.isHidden)
              .map((tab) => (
                <Tab as={Fragment} key={tab.key}>
                  {({ selected }) => (
                    <button
                      type="button"
                      className={`w-30 mx-2 mr-4 py-2 text-sm font-medium outline-none ${
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
            {currentWorkspace?.version === ProjectVersion.V3 && (
              <Tab.Panel>
                <EncryptionTab />
              </Tab.Panel>
            )}
            <Tab.Panel>
              <WorkflowIntegrationTab />
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
