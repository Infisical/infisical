import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { workspaceKeys } from "@app/hooks/api";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchWorkspaceById } from "@app/hooks/api/workspace/queries";
import { ProjectLayout } from "@app/layouts/ProjectLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-scanning/$projectId/_secret-scanning-layout"
)({
  component: ProjectLayout,
  beforeLoad: async ({ params, context }) => {
    const project = await context.queryClient.ensureQueryData({
      queryKey: workspaceKeys.getWorkspaceById(params.projectId),
      queryFn: () => fetchWorkspaceById(params.projectId)
    });

    await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserProjectPermissions({
        workspaceId: params.projectId
      }),
      queryFn: () => fetchUserProjectPermissions({ workspaceId: params.projectId })
    });

    return {
      breadcrumbs: [
        {
          label: "Secret Scanning",
          link: linkOptions({ to: "/organization/secret-scanning/overview" })
        },
        {
          label: project.name,
          link: linkOptions({
            to: "/secret-scanning/$projectId/data-sources",
            params: { projectId: project.id }
          })
        }
      ]
    };
  }
});
