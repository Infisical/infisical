import { Fragment } from "react"
import { Tab } from "@headlessui/react"

import { useOrganization,useUser } from "@app/context";
import {
    useGetOrgUsers
} from "@app/hooks/api";

import { OrgAuthTab } from "../OrgAuthTab";
import { OrgGeneralTab } from "../OrgGeneralTab";

export const OrgTabGroup = () => {
    const { currentOrg } = useOrganization();
    const { user } = useUser();
    const { data } = useGetOrgUsers(currentOrg?._id ?? "");

    const isRoleSufficient = data?.some((orgUser) => {
        return orgUser.role !== "member" && orgUser.user._id === user._id;
    });

    const tabs = [
        { name: "General", key: "tab-org-general" },
    ];
        
    if (isRoleSufficient) {
        tabs.push(
            { name: "SAML SSO", key: "tab-org-saml" }
        );
    }

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
                    <OrgGeneralTab />
                </Tab.Panel>
                {isRoleSufficient && (
                    <Tab.Panel>
                        <OrgAuthTab />
                    </Tab.Panel>
                )}
            </Tab.Panels>
        </Tab.Group>
    );
}