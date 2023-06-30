import { Fragment } from "react"
import { Tab } from "@headlessui/react"

import { ProjectGeneralTab } from "../ProjectGeneralTab";
import { ProjectServiceTokensTab } from "../ProjectServiceTokensTab";

const tabs = [
    { name: "General", key: "tab-project-general" },
    { name: "Service Tokens", key: "tab-project-service-tokens" }
];

export const ProjectTabGroup = () => {
    return (
        <Tab.Group>
            <Tab.List className="mb-6 border-b-2 border-mineshaft-800 w-full">
                {tabs.map((tab) => (
                    <Tab as={Fragment} key={tab.key}> 
                        {({ selected }) => (
                            <button 
                                type="button"
                                className={`w-30 p-4 font-semibold outline-none ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"}`}
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
                    <ProjectServiceTokensTab />
                </Tab.Panel>
            </Tab.Panels>
        </Tab.Group>
    );
}