import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { workspaceKeys } from "@app/hooks/api";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchWorkspaceById } from "@app/hooks/api/workspace/queries";
import { ProjectLayout } from "@app/layouts/ProjectLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout"
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
      project,
      breadcrumbs: [
        {
          label: "Secret Managers",
          icon: () => <FontAwesomeIcon icon={faHome} />,
          link: linkOptions({ to: "/organization/secret-manager/overview" })
        },
        {
          label: project.name,
          link: linkOptions({
            to: "/secret-manager/$projectId/overview",
            params: { projectId: project.id }
          })
        }
      ]
    };
  }
});
