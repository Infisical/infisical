import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useGetAccessRequestsCount, useGetSecretApprovalRequestCount } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AccessApprovalRequest } from "./components/AccessApprovalRequest";
import { ApprovalPolicyList } from "./components/ApprovalPolicyList";
import { SecretApprovalRequest } from "./components/SecretApprovalRequest";

enum TabSection {
  SecretApprovalRequests = "approval-requests",
  ResourceApprovalRequests = "resource-requests",
  Policies = "policies"
}

export const SecretApprovalsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject, projectId } = useProject();
  const projectSlug = currentProject?.slug || "";
  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    projectId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({ projectSlug });

  const { selectedTab: searchTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.ApprovalPage.id
  });

  const defaultTab =
    (accessApprovalRequestCount?.pendingCount || 0) > (secretApprovalReqCount?.open || 0)
      ? TabSection.ResourceApprovalRequests
      : TabSection.SecretApprovalRequests;

  const selectedTab = searchTab || defaultTab;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/approval",
      params: { orgId: currentOrg.id, projectId },
      // Clear any open request detail when switching tabs so returning to
      // Change Requests does not reopen a stale requestId.
      search: { selectedTab: tab, requestId: "" }
    });
  };

  return (
    <div>
      <Helmet>
        <title>{t("common.head-title", { title: t("approval.title") })}</title>
        <meta property="og:title" content={String(t("approval.og-title"))} />
        <meta name="og:description" content={String(t("approval.og-description"))} />
      </Helmet>
      <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Approval Workflows"
          description="Create approval policies for any modifications to secrets in sensitive environments and folders."
        />
        <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
          <TabList>
            <Tab variant="project" value={TabSection.SecretApprovalRequests}>
              Change Requests
              {Boolean(secretApprovalReqCount?.open) && (
                <Badge variant="warning" className="ml-2">
                  {secretApprovalReqCount?.open}
                </Badge>
              )}
            </Tab>
            <Tab variant="project" value={TabSection.ResourceApprovalRequests}>
              Access Requests
              {Boolean(accessApprovalRequestCount?.pendingCount) && (
                <Badge variant="warning" className="ml-2">
                  {accessApprovalRequestCount?.pendingCount}
                </Badge>
              )}
            </Tab>
            <Tab variant="project" value={TabSection.Policies}>
              Policies
            </Tab>
          </TabList>
          <TabPanel value={TabSection.SecretApprovalRequests}>
            <SecretApprovalRequest />
          </TabPanel>
          <TabPanel value={TabSection.ResourceApprovalRequests}>
            <AccessApprovalRequest projectId={projectId} projectSlug={projectSlug} />
          </TabPanel>
          <TabPanel value={TabSection.Policies}>
            <ApprovalPolicyList projectId={projectId} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
