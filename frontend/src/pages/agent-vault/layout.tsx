import { createFileRoute, redirect } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { fetchAgentVaultProjectId } from "@app/hooks/api/agentVault/queries";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { Organization } from "@app/hooks/api/organization/types";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { AgentVaultLayout } from "@app/layouts/AgentVaultLayout";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout"
)({
  component: AgentVaultLayout,
  beforeLoad: async ({ params, context }) => {
    const org = context.queryClient.getQueryData<Organization>(
      organizationKeys.getOrgById(params.orgId)
    );

    let agentVaultProjectId = org?.agentVaultProjectId;
    if (!agentVaultProjectId) {
      // Lazily bootstrap the project and patch its id into the cached org so the Project/ProjectPermission
      // contexts pick it up (injecting the returned id avoids a refetch that could race read-replica lag).
      const resolvedAgentVaultProjectId = await fetchAgentVaultProjectId();
      agentVaultProjectId = resolvedAgentVaultProjectId;
      context.queryClient.setQueryData<Organization>(
        organizationKeys.getOrgById(params.orgId),
        (old) => (old ? { ...old, agentVaultProjectId: resolvedAgentVaultProjectId } : old)
      );
    }

    if (!agentVaultProjectId) {
      throw redirect({ to: "/organizations/$orgId/projects", params: { orgId: params.orgId } });
    }

    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(agentVaultProjectId),
        queryFn: () => fetchProjectById(agentVaultProjectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId: agentVaultProjectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId: agentVaultProjectId })
      })
    ]);

    return {
      breadcrumbs: [{ type: BreadcrumbTypes.Component, component: ProjectSelect }]
    };
  }
});
