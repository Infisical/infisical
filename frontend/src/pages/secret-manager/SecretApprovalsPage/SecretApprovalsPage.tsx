import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
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
        <Tabs orientation="vertical" value={selectedTab}>
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
