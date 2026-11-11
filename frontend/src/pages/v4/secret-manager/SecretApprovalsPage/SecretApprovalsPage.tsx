import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { EmptyState } from "@app/components/v4/ui/empty";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { withoutDefaults } from "../search-defaults";
import { ChangeRequests, RequestDetail } from "./change-requests/ChangeRequests";
import { TabSection } from "./tabs";

const ROUTE = v4Path("/organizations/$orgId/projects/secret-management/$projectId/approval");

export const SecretApprovalsPage = () => {
  const { orgId, projectId } = useParams({ from: ROUTE });
  const { selectedTab, requestId } = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: ROUTE });
  const secrets = useV4Adapter("secrets");
  const { data: count } = secrets.useApprovalRequestCount({ projectId });
  const { data: project } = secrets.useProject(projectId);
  const tab = selectedTab || TabSection.SecretApprovalRequests;
  const base = orgHref(orgId, `/projects/secret-management/${projectId}/approval`);
  const approvalSearch = (nextTab: string, nextRequestId: string) =>
    withoutDefaults(
      { selectedTab: nextTab, requestId: nextRequestId },
      { selectedTab: TabSection.SecretApprovalRequests, requestId: "" }
    );
  const hrefFor = (id: string) =>
    `${base}?${new URLSearchParams(approvalSearch(TabSection.SecretApprovalRequests, id))}`;
  const environmentName = (slug: string) =>
    project?.environments.find((environment) => environment.slug === slug)?.name ?? slug;
  if (tab === TabSection.SecretApprovalRequests && requestId)
    return (
      <RequestDetail
        projectId={projectId}
        requestId={requestId}
        environmentName={environmentName}
        listHref={`${base}?selectedTab=${TabSection.SecretApprovalRequests}`}
      />
    );
  const notPorted = (
    <EmptyState
      icon="inbox"
      title="Not available in v4 yet"
      description="Use the current app for this section."
    />
  );
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
              { value: TabSection.ResourceApprovalRequests, label: "Access requests" },
              { value: TabSection.Policies, label: "Policies" }
            ]}
          />
        }
      />
      {tab === TabSection.SecretApprovalRequests ? (
        <ChangeRequests
          projectId={projectId}
          environmentName={environmentName}
          hrefFor={hrefFor}
          onView={(id) =>
            navigate({
              search: approvalSearch(TabSection.SecretApprovalRequests, id)
            })
          }
        />
      ) : (
        notPorted
      )}
    </Stack>
  );
};
