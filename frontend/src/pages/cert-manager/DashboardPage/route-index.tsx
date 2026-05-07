import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/"
)({
  beforeLoad: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserProjectPermissions({ projectId: params.projectId }),
      queryFn: () => fetchUserProjectPermissions({ projectId: params.projectId })
    });

    const isAdmin = data.memberships?.some((m) => m.roles.some((r) => r.role === "admin"));

    throw redirect({
      to: isAdmin
        ? "/organizations/$orgId/projects/cert-manager/$projectId/overview"
        : "/organizations/$orgId/projects/cert-manager/$projectId/applications",
      params
    });
  }
});
