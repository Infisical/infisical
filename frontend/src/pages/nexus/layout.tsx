import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { NexusLayout } from "@app/layouts/NexusLayout";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout"
)({
  component: NexusLayout,
  beforeLoad: async ({ params, context }) => {
    console.log("[NEXUS] beforeLoad called", params.projectId);
    try {
      const project = await context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(params.projectId),
        queryFn: () => fetchProjectById(params.projectId)
      });
      console.log("[NEXUS] project fetched", project);

      await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({
          projectId: params.projectId
        }),
        queryFn: () => fetchUserProjectPermissions({ projectId: params.projectId })
      });
      console.log("[NEXUS] permissions fetched");

      return {
        project,
        breadcrumbs: [
          {
            type: BreadcrumbTypes.Component,
            component: ProjectSelect
          }
        ]
      };
    } catch (err) {
      console.error("[NEXUS] beforeLoad error:", err);
      throw err;
    }
  }
});
