import { useState } from "react";
import { Helmet } from "react-helmet";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";

import { PolicyTab } from "./components/PolicyTab";
import { RequestsTab } from "./components/RequestsTab";

enum ApprovalTabs {
  Policies = "policies",
  Requests = "requests"
}

export const ApprovalsPage = () => {
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState(ApprovalTabs.Requests);

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title="Certificate Approvals"
          description="Manage approval workflows, update policy settings, and monitor request statuses for certificate issuance."
        />
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ApprovalTabs)}
        >
          <TabList>
            <Tab variant="project" value={ApprovalTabs.Requests}>
              Requests
            </Tab>
            <Tab variant="project" value={ApprovalTabs.Policies}>
              Policies
            </Tab>
          </TabList>
          <TabPanel value={ApprovalTabs.Requests}>
            <RequestsTab />
          </TabPanel>
          <TabPanel value={ApprovalTabs.Policies}>
            <PolicyTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
