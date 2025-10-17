import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { useProject } from "@app/context";
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
  const { currentProject, projectId } = useProject();
  const projectSlug = currentProject?.slug || "";
  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    projectId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug,
    namespaceId: currentProject.namespaceId
  });
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
          scope="project"
          title="Approval Workflows"
          description="Create approval policies for any modifications to secrets in sensitive environments and folders."
        />
        <Tabs defaultValue={defaultTab}>
          <TabList>
            <Tab value={TabSection.SecretApprovalRequests}>
              Change Requests
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
            <AccessApprovalRequest />
          </TabPanel>
          <TabPanel value={TabSection.Policies}>
            <ApprovalPolicyList projectId={projectId} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
