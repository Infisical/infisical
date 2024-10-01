import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Tab } from "@headlessui/react";

import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ImportTab } from "../ImportTab";
import { OrgAuthTab } from "../OrgAuthTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab/OrgWorkflowIntegrationTab";

const tabs = [
  { name: "General", key: "tab-org-general" },
  { name: "Security", key: "tab-org-security" },
  { name: "Encryption", key: "tab-org-encryption" },
  { name: "Workflow Integrations", key: "workflow-integrations" },
  { name: "Audit Log Streams", key: "tag-audit-log-streams" },
  { name: "Import", key: "tab-import" }
];
export const OrgTabGroup = () => {
  const { query } = useRouter();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const selectedTab = query.selectedTab as string;

  useEffect(() => {
    if (selectedTab) {
      const index = tabs.findIndex((tab) => tab.key === selectedTab);
      if (index !== -1) {
        setSelectedTabIndex(index);
      }
    }
  }, [selectedTab]);

  return (
    <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
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
          <OrgWorkflowIntegrationTab />
        </Tab.Panel>
        <Tab.Panel>
          <AuditLogStreamsTab />
        </Tab.Panel>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
        <Tab.Panel>
          <ImportTab />
        </Tab.Panel>
        </OrgPermissionCan>
      </Tab.Panels>
    </Tab.Group>
  );
};
