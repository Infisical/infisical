import { Fragment } from "react";
import { Tab } from "@headlessui/react";

import { ProjectGeneralTab } from "../ProjectGeneralTab";
import { WebhooksTab } from "../WebhooksTab";

const tabs = [
  { name: "General", key: "tab-project-general" },
  { name: "Webhooks", key: "tab-project-webhooks" }
];

export const ProjectTabGroup = () => {
    return (
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
    );
}