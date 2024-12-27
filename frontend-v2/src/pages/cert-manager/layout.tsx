import { createFileRoute } from "@tanstack/react-router";

import { workspaceKeys } from "@app/hooks/api";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchWorkspaceById } from "@app/hooks/api/workspace/queries";
import { ProjectLayout } from "@app/layouts/ProjectLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout"
)({
  component: ProjectLayout,
  beforeLoad: async ({ params, context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: workspaceKeys.getWorkspaceById(params.projectId),
      queryFn: () => fetchWorkspaceById(params.projectId)
    });

    await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserProjectPermissions({
        workspaceId: params.projectId
      }),
      queryFn: () => fetchUserProjectPermissions({ workspaceId: params.projectId })
    });
  }
});
