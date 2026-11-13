import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/"
)({
  beforeLoad: async ({ params, context }) => {
    const projectId = context.implicitProjectId;
    const data = await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
      queryFn: () => fetchUserProjectPermissions({ projectId })
    });

    const isAdmin = data.memberships?.some((m) => m.roles.some((r) => r.role === "admin"));

    throw redirect({
      to: isAdmin
        ? "/organizations/$orgId/cert-manager/overview"
        : "/organizations/$orgId/cert-manager/applications",
      params
    });
  }
});
