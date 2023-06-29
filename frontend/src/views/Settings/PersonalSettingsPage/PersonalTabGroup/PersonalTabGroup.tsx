import { Fragment } from "react"
import { Tab } from "@headlessui/react"

import { PersonalAPIKeyTab } from "../PersonalAPIKeyTab";
import { PersonalSecurityTab } from "../PersonalSecurityTab";

const tabs = [
    { name: "Security", key: "tab-account-security" },
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
                    <PersonalSecurityTab />
                </Tab.Panel>
                <Tab.Panel>
                    <PersonalAPIKeyTab />
                </Tab.Panel>
            </Tab.Panels>
        </Tab.Group>
    );
}