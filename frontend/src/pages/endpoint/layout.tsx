import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { endpointKeys, fetchEndpointProjectId } from "@app/hooks/api/endpoint";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { EndpointLayout } from "@app/layouts/EndpointLayout";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout"
)({
  component: EndpointLayout,
  beforeLoad: async ({ context }) => {
    // Endpoint's project is always creatable, so unlike PAM there is no redirect on the happy
    // path here. A failed resolve surfaces as a route error instead of silently bouncing users.
    const projectId = await context.queryClient.ensureQueryData({
      queryKey: endpointKeys.project(),
      queryFn: fetchEndpointProjectId
    });

    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(projectId),
        queryFn: () => fetchProjectById(projectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({
          projectId
        }),
        queryFn: () => fetchUserProjectPermissions({ projectId })
      })
    ]);

    return {
      breadcrumbs: [
        {
          type: BreadcrumbTypes.Component,
          component: ProjectSelect
        }
      ]
    };
  }
});
