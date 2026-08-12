import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { Organization } from "@app/hooks/api/organization/types";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchSandboxProjectId } from "@app/hooks/api/sandboxes";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";
import { SandboxLayout } from "@app/layouts/SandboxLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sandboxes/_sandbox-layout"
)({
  component: SandboxLayout,
  beforeLoad: async ({ params, context }) => {
    const org = context.queryClient.getQueryData<Organization>(
      organizationKeys.getOrgById(params.orgId)
    );

    let projectId = org?.sandboxProjectId;
    if (!projectId) {
      // First visit bootstraps the project, so patch the id into the cached org rather than
      // refetching: the Project and ProjectPermission contexts read it from there.
      projectId = await fetchSandboxProjectId();
      const resolved = projectId;
      context.queryClient.setQueryData<Organization>(
        organizationKeys.getOrgById(params.orgId),
        (old) => (old ? { ...old, sandboxProjectId: resolved } : old)
      );
    }

    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(projectId),
        queryFn: () => fetchProjectById(projectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId })
      })
    ]);

    return {
      breadcrumbs: [{ type: BreadcrumbTypes.Component, component: ProjectSelect }]
    };
  }
});
