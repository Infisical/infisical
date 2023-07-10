import { Fragment } from "react"
import { Tab } from "@headlessui/react"

import { PersonalAPIKeyTab } from "../PersonalAPIKeyTab";
import { PersonalSecurityTab } from "../PersonalSecurityTab";

const tabs = [
    { name: "General", key: "tab-account-security" },
    { name: "API Keys", key: "tab-account-api-keys" }
];

export const PersonalTabGroup = () => {
    return (
        <Tab.Group>
            <Tab.List className="mb-6 border-b-2 border-mineshaft-800 w-full">
                {tabs.map((tab) => (
                    <Tab as={Fragment} key={tab.key}> 
                        {({ selected }) => (
                            <button 
                                type="button"
                                className={`w-30 py-2 mx-2 mr-4 font-medium text-sm outline-none ${selected ? "border-b border-white text-white" : "text-mineshaft-400"}`}
                            >
                                {tab.name}
                            </button>
                        )}
                    </Tab>
                ))}
            </Tab.List>
            <Tab.Panels>
                <Tab.Panel>
                    <PersonalSecurityTab />
                </Tab.Panel>
                <Tab.Panel>
                    <PersonalAPIKeyTab />
                </Tab.Panel>
            </Tab.Panels>
        </Tab.Group>
    );
}