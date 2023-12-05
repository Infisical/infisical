import Link from "next/link";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  const workspaceId = currentWorkspace?.id || "";

  return (
    <div className="container mx-auto bg-bunker-800 text-white w-full h-full max-w-7xl px-6">
      <div className="py-6 flex justify-between items-center">
        <div className="flex flex-col w-full">
          <h2 className="text-3xl font-semibold text-gray-200">Secret Approval Workflows</h2>
          <p className="text-bunker-300">Create approval policies for any modifications to secrets in sensitive environments and folders.</p>
        </div>
        <div className="flex justify-center w-max">
          <Link href="https://infisical.com/docs/documentation/platform/pr-workflows">
            <span className="rounded-md px-4 py-2 w-max text-mineshaft-200 hover:text-white bg-mineshaft-600 border border-mineshaft-500 hover:bg-primary/10 hover:border-primary/40 duration-200 cursor-pointer">
              Documentation <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs mb-[0.06rem] ml-1"/>
            </span>
          </Link> 
        </div>
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
