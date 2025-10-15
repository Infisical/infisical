import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { NamespaceSelect } from "@app/layouts/NamespaceLayout/components/NamespaceSelect";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";
import { SecretScanningLayout } from "@app/layouts/SecretScanningLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout"
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

    const breadcrumbs = [
      {
        type: BreadcrumbTypes.Component,
        component: ProjectSelect
      }
    ];
    if (project.namespaceId) {
      breadcrumbs.unshift({
        type: BreadcrumbTypes.Component,
        component: () => <NamespaceSelect namespaceId={project.namespaceId as string} />
      });
    }

    return {
      project,
      breadcrumbs
    };
  }
});
