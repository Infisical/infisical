import { createFileRoute, notFound } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { AgentVaultLayout } from "@app/layouts/AgentVaultLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout"
)({
  component: AgentVaultLayout,
  beforeLoad: async ({ params, context }) => {
    const [project] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(params.projectId),
        queryFn: () => fetchProjectById(params.projectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({
          projectId: params.projectId
        }),
        queryFn: () => fetchUserProjectPermissions({ projectId: params.projectId })
      })
    ]);

    if (project.type !== ProjectType.AgentVault) throw notFound();

    return {
      project,
      breadcrumbs: []
    };
  }
});
