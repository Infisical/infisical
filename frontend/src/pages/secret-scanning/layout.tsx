import { createFileRoute } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { SecretScanningLayout } from "@app/layouts/SecretScanningLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout"
)({
  component: SecretScanningLayout,
  beforeLoad: async ({ params, context }) => {
    const project = await context.queryClient.ensureQueryData({
      queryKey: projectKeys.getProjectById(params.projectId),
      queryFn: () => fetchProjectById(params.projectId)
    });

    await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserProjectPermissions({
        projectId: params.projectId
      }),
      queryFn: () => fetchUserProjectPermissions({ projectId: params.projectId })
    });

    return {
      project,
      breadcrumbs: []
    };
  }
});
