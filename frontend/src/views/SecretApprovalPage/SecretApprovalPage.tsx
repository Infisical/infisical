import Link from "next/link";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Divider from "@app/components/basic/Divider";
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useWorkspace } from "@app/context";

import { AccessApprovalPolicyList } from "./components/AccessApprovalPolicyList";
import { AccessApprovalRequest } from "./components/AccessApprovalRequest";
import { SecretApprovalPolicyList } from "./components/SecretApprovalPolicyList";
import { SecretApprovalRequest } from "./components/SecretApprovalRequest";

enum TabSection {
  SecretApprovalRequests = "approval-requests",
  SecretPolicies = "approval-rules",
  ResourcePolicies = "resource-rules",
  ResourceApprovalRequests = "resource-requests"
}

export const SecretApprovalPage = () => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  return (
    <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
      <div className="flex items-center justify-between py-6">
        <div className="flex w-full flex-col">
          <h2 className="text-3xl font-semibold text-gray-200">Approval Workflows</h2>
          <p className="text-bunker-300">
            Create approval policies for any modifications to secrets in sensitive environments and
            folders.
          </p>
        </div>
        <div className="flex w-max justify-center">
          <Link href="https://infisical.com/docs/documentation/platform/pr-workflows">
            <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
              Documentation{" "}
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] ml-1 text-xs"
              />
            </span>
          </Link>
        </div>
      </div>
      <Tabs defaultValue={TabSection.SecretApprovalRequests}>
        <TabList>
          <Tab value={TabSection.SecretApprovalRequests}>Change Requests</Tab>
          <Tab value={TabSection.SecretPolicies}>Change Request Policies</Tab>
          <Divider />
          <Tab value={TabSection.ResourceApprovalRequests}>Access Requests</Tab>
          <Tab value={TabSection.ResourcePolicies}>Access Request Policies</Tab>
        </TabList>
        <TabPanel value={TabSection.SecretApprovalRequests}>
          <SecretApprovalRequest />
        </TabPanel>
        <TabPanel value={TabSection.SecretPolicies}>
          <SecretApprovalPolicyList workspaceId={projectId} />
        </TabPanel>

        <TabPanel value={TabSection.ResourceApprovalRequests}>
          <AccessApprovalRequest projectId={projectId} projectSlug={projectSlug} />
        </TabPanel>

        <TabPanel value={TabSection.ResourcePolicies}>
          <AccessApprovalPolicyList workspaceId={projectId} />
        </TabPanel>
      </Tabs>
    </div>
  );
};
