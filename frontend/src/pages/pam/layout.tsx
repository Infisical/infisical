import { createFileRoute, redirect } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { Organization } from "@app/hooks/api/organization/types";
import { fetchPamProjectId } from "@app/hooks/api/pam/queries";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { PamLayout } from "@app/layouts/PamLayout";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout"
)({
  component: PamLayout,
  beforeLoad: async ({ params, context }) => {
    const org = context.queryClient.getQueryData<Organization>(
      organizationKeys.getOrgById(params.orgId)
    );

    let pamProjectId = org?.pamProjectId;
    if (!pamProjectId) {
      // Lazily bootstrap the project and patch its id into the cached org so the Project/ProjectPermission
      // contexts pick it up (injecting the returned id avoids a refetch that could race read-replica lag).
      const resolvedPamProjectId = await fetchPamProjectId();
      pamProjectId = resolvedPamProjectId;
      context.queryClient.setQueryData<Organization>(
        organizationKeys.getOrgById(params.orgId),
        (old) => (old ? { ...old, pamProjectId: resolvedPamProjectId } : old)
      );
    }

    if (!pamProjectId) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }

    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(pamProjectId),
        queryFn: () => fetchProjectById(pamProjectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({
          projectId: pamProjectId
        }),
        queryFn: () => fetchUserProjectPermissions({ projectId: pamProjectId })
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
