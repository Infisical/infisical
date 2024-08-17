import { Fragment } from "react";
import { Tab } from "@headlessui/react";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { OrgAuthTab } from "../OrgAuthTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";

const tabs = [
  { name: "General", key: "tab-org-general" },
  { name: "Security", key: "tab-org-security" },
  { name: "Encryption", key: "tab-org-encryption" },
  { name: "Audit Log Streams", key: "tag-audit-log-streams" }
];
export const OrgTabGroup = () => {
  return (
    <Tab.Group>
      <Tab.List className="mb-6 w-full border-b-2 border-mineshaft-800">
        {tabs.map((tab) => (
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
          <OrgGeneralTab />
        </Tab.Panel>
        <Tab.Panel>
          <OrgAuthTab />
        </Tab.Panel>
        <Tab.Panel>
          <OrgEncryptionTab />
        </Tab.Panel>
        <Tab.Panel>
          <AuditLogStreamsTab />
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  );
};
