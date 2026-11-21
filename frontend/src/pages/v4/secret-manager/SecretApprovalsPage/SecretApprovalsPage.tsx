import { useEffect, useState } from "react";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PolicyType } from "@app/hooks/api/policies/enums";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { PageLoader } from "../../shell/project-gate";
import { withoutDefaults } from "../search-defaults";
import { AccessRequests } from "./access-requests/AccessRequests";
import { ChangeRequests } from "./change-requests/ChangeRequests";
import { RequestDetail } from "./change-requests/RequestDetail";
import { ApprovalPolicies } from "./policies/ApprovalPolicies";
import { TabSection } from "./tabs";

const ROUTE = v4Path("/organizations/$orgId/projects/secret-management/$projectId/approval");

export const SecretApprovalsPage = () => {
  const { orgId, projectId } = useParams({ from: ROUTE });
  const { selectedTab, requestId } = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: ROUTE });
  const [openAddPolicy, setOpenAddPolicy] = useState<PolicyType | null>(null);
  const secrets = useV4Adapter("secrets");
  const { data: count } = secrets.useApprovalRequestCount({ projectId });
  const { data: project } = secrets.useProject(projectId);
  const { data: accessCount } = useV4Adapter("accessApprovals").useRequestCount(
    project?.slug ?? ""
  );
  const defaultTab =
    (accessCount?.pendingCount || 0) > (count?.open || 0)
      ? TabSection.ResourceApprovalRequests
      : TabSection.SecretApprovalRequests;
  const tab = selectedTab || defaultTab;

  useEffect(() => {
    if (selectedTab || !count || !accessCount) return;
    navigate({ search: (prev) => ({ ...prev, selectedTab: defaultTab }), replace: true });
  }, [selectedTab, count, accessCount, defaultTab, navigate]);

  const base = orgHref(orgId, `/projects/secret-management/${projectId}/approval`);
  const approvalSearch = (nextTab: string, nextRequestId: string) =>
    withoutDefaults(
      { selectedTab: nextTab, requestId: nextRequestId },
      { selectedTab: "", requestId: "" }
    );
  const hrefFor = (id: string) =>
    `${base}?${new URLSearchParams(approvalSearch(TabSection.SecretApprovalRequests, id))}`;
  const environmentName = (slug: string) =>
    project?.environments.find((environment) => environment.slug === slug)?.name ?? slug;
  const configurePolicy = (policyType: PolicyType) => {
    setOpenAddPolicy(policyType);
    navigate({ search: approvalSearch(TabSection.Policies, "") });
  };

  if (tab === TabSection.SecretApprovalRequests && requestId)
    return (
      <RequestDetail
        projectId={projectId}
        requestId={requestId}
        environmentName={environmentName}
        listHref={`${base}?selectedTab=${TabSection.SecretApprovalRequests}`}
      />
    );

  const body = () => {
    if (tab === TabSection.ResourceApprovalRequests)
      return (
        <AccessRequests
          orgId={orgId}
          projectId={projectId}
          requestId={requestId}
          onOpenRequest={(id) => navigate({ search: approvalSearch(tab, id) })}
          onConfigurePolicies={() => configurePolicy(PolicyType.AccessPolicy)}
        />
      );
    if (tab === TabSection.Policies)
      return project ? (
        <ApprovalPolicies
          project={project}
          openAddPolicy={openAddPolicy}
          onAddPolicyOpened={() => setOpenAddPolicy(null)}
        />
      ) : (
        <PageLoader label="Loading policies" />
      );
    return (
      <ChangeRequests
        projectId={projectId}
        environmentName={environmentName}
        hrefFor={hrefFor}
        onConfigurePolicies={() => configurePolicy(PolicyType.ChangePolicy)}
      />
    );
  };

  return (
    <Stack gap={24}>
      <PageHeader
        title="Approval workflows"
        description="Require review before secrets change in sensitive environments and folders."
        tabs={
          <Tabs
            label="Approval sections"
            value={tab}
            onValueChange={(next) => navigate({ search: approvalSearch(next, "") })}
            tabs={[
              {
                value: TabSection.SecretApprovalRequests,
                label: "Change requests",
                count: count?.open || undefined
              },
              {
                value: TabSection.ResourceApprovalRequests,
                label: "Access requests",
                count: accessCount?.pendingCount || undefined
              },
              { value: TabSection.Policies, label: "Policies" }
            ]}
          />
        }
      />
      {body()}
    </Stack>
  );
};
