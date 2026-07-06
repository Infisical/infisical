import { createFileRoute, redirect } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { projectKeys } from "@app/hooks/api";
import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
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
      // The org has no consolidated PAM project yet (lazy creation). Hitting the PAM endpoint
      // bootstraps it server-side; refetch the org so pamProjectId is populated for the contexts
      // that read it (ProjectContext / ProjectPermissionContext).
      pamProjectId = await fetchPamProjectId();
      const refreshedOrg = await context.queryClient.fetchQuery({
        queryKey: organizationKeys.getOrgById(params.orgId),
        queryFn: () => fetchOrganizationById(params.orgId)
      });
      pamProjectId = refreshedOrg?.pamProjectId ?? pamProjectId;
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
