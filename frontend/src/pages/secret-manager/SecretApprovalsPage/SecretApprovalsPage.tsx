import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Badge, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
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

  // The default tab is derived from live request counts. Pin it into the URL
  // once both counts have loaded so the active tab stops tracking the counts.
  // Otherwise closing a request changes the counts and silently flips the
  // visible tab (e.g. Change Requests to Access Requests). See PLATFOR-489.
  useEffect(() => {
    if (searchTab || !secretApprovalReqCount || !accessApprovalRequestCount) return;

    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/approval",
      params: { orgId: currentOrg.id, projectId },
      search: (prev) => ({ ...prev, selectedTab: defaultTab }),
      replace: true
    });
  }, [
    searchTab,
    secretApprovalReqCount,
    accessApprovalRequestCount,
    defaultTab,
    navigate,
    currentOrg.id,
    projectId
  ]);

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
      <div className="mx-auto h-full w-full max-w-8xl bg-background text-foreground">
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Approval Workflows"
          description="Create approval policies for any modifications to secrets in sensitive environments and folders."
        />
        <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
          <TabsList variant="project">
            <TabsTrigger value={TabSection.SecretApprovalRequests}>
              Change Requests
              {Boolean(secretApprovalReqCount?.open) && (
                <Badge variant="project">{secretApprovalReqCount?.open}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value={TabSection.ResourceApprovalRequests}>
              Access Requests
              {Boolean(accessApprovalRequestCount?.pendingCount) && (
                <Badge variant="project">{accessApprovalRequestCount?.pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value={TabSection.Policies}>Policies</TabsTrigger>
          </TabsList>
          <TabsContent value={TabSection.SecretApprovalRequests}>
            <SecretApprovalRequest />
          </TabsContent>
          <TabsContent value={TabSection.ResourceApprovalRequests}>
            <AccessApprovalRequest projectId={projectId} projectSlug={projectSlug} />
          </TabsContent>
          <TabsContent value={TabSection.Policies}>
            <ApprovalPolicyList projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
