import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useWorkspace } from "@app/context";

import { SecretApprovalPolicyList } from "./components/SecretApprovalPolicyList";
import { SecretApprovalRequest } from "./components/SecretApprovalRequest";

enum TabSection {
  ApprovalRequests = "approval-requests",
  Rules = "approval-rules"
}

export const SecretApprovalPage = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";

  return (
    <div className="container mx-auto bg-bunker-800 text-white w-full h-full max-w-7xl px-6">
      <div className="my-6">
        <p className="text-3xl font-semibold text-gray-200">Secret Approvals</p>
      </div>
      <Tabs defaultValue={TabSection.ApprovalRequests}>
        <TabList>
          <Tab value={TabSection.ApprovalRequests}>Secret PRs</Tab>
          <Tab value={TabSection.Rules}>Policies</Tab>
        </TabList>
        <TabPanel value={TabSection.ApprovalRequests}>
          <SecretApprovalRequest />
        </TabPanel>
        <TabPanel value={TabSection.Rules}>
          <SecretApprovalPolicyList workspaceId={workspaceId} />
        </TabPanel>
      </Tabs>
    </div>
  );
};
