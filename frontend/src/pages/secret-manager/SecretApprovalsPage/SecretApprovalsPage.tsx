import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { useWorkspace } from "@app/context";
import { useGetAccessRequestsCount, useGetSecretApprovalRequestCount } from "@app/hooks/api";

import { AccessApprovalRequest } from "./components/AccessApprovalRequest";
import { ApprovalPolicyList } from "./components/ApprovalPolicyList";
import { SecretApprovalRequest } from "./components/SecretApprovalRequest";

enum TabSection {
  SecretApprovalRequests = "approval-requests",
  SecretPolicies = "approval-rules",
  ResourcePolicies = "resource-rules",
  ResourceApprovalRequests = "resource-requests",
  Policies = "policies"
}

export const SecretApprovalsPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";
  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    workspaceId: projectId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({ projectSlug });
  const defaultTab =
    (accessApprovalRequestCount?.pendingCount || 0) > (secretApprovalReqCount?.open || 0)
      ? TabSection.ResourceApprovalRequests
      : TabSection.SecretApprovalRequests;

  return (
    <div>
      <Helmet>
        <title>{t("common.head-title", { title: t("approval.title") })}</title>
        <meta property="og:title" content={String(t("approval.og-title"))} />
        <meta name="og:description" content={String(t("approval.og-description"))} />
      </Helmet>
      <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 text-white">
        <PageHeader
          title="Approval Workflows"
          description="Create approval policies for any modifications to secrets in sensitive environments and folders.
"
        >
          <a
            href="https://infisical.com/docs/documentation/platform/pr-workflows"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
              Documentation
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] ml-1 text-xs"
              />
            </span>
          </a>
        </PageHeader>
        <Tabs defaultValue={defaultTab}>
          <TabList>
            <Tab value={TabSection.SecretApprovalRequests}>
              Secret Requests
              {Boolean(secretApprovalReqCount?.open) && (
                <Badge className="ml-2">{secretApprovalReqCount?.open}</Badge>
              )}
            </Tab>
            <Tab value={TabSection.ResourceApprovalRequests}>
              Access Requests
              {Boolean(accessApprovalRequestCount?.pendingCount) && (
                <Badge className="ml-2">{accessApprovalRequestCount?.pendingCount}</Badge>
              )}
            </Tab>
            <Tab value={TabSection.Policies}>Policies</Tab>
          </TabList>
          <TabPanel value={TabSection.SecretApprovalRequests}>
            <SecretApprovalRequest />
          </TabPanel>
          <TabPanel value={TabSection.ResourceApprovalRequests}>
            <AccessApprovalRequest projectId={projectId} projectSlug={projectSlug} />
          </TabPanel>
          <TabPanel value={TabSection.Policies}>
            <ApprovalPolicyList workspaceId={projectId} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
