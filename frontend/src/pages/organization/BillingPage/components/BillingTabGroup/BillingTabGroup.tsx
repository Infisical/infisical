import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { withPermission } from "@app/hoc";

import { BillingCloudTab } from "../BillingCloudTab";
import { BillingDetailsTab } from "../BillingDetailsTab";
import { BillingReceiptsTab } from "../BillingReceiptsTab";
import { BillingSelfHostedTab } from "../BillingSelfHostedTab";

const tabs = [
  { name: "Infisical Cloud", key: "tab-infisical-cloud" },
  { name: "Infisical Self-Hosted", key: "tab-infisical-self-hosted" },
  { name: "Receipts", key: "tab-receipts" },
  { name: "Billing details", key: "tab-billing-details" }
];

export const BillingTabGroup = withPermission(
  () => {
    if (!isInfisicalCloud()) {
      return <BillingCloudTab />;
    }

    return (
      <Tabs orientation="vertical" defaultValue={tabs[0].key}>
        <TabList>
          {tabs.map((tab) => (
            <Tab variant="org" value={tab.key}>
              {tab.name}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={tabs[0].key}>
          <BillingCloudTab />
        </TabPanel>
        <TabPanel value={tabs[1].key}>
          <BillingSelfHostedTab />
        </TabPanel>
        <TabPanel value={tabs[2].key}>
          <BillingReceiptsTab />
        </TabPanel>
        <TabPanel value={tabs[3].key}>
          <BillingDetailsTab />
        </TabPanel>
      </Tabs>
    );
  },
  { action: OrgPermissionBillingActions.Read, subject: OrgPermissionSubjects.Billing }
);
