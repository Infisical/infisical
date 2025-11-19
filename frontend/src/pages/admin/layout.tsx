import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "@app/layouts/AdminLayout";

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/_admin-layout")({
  component: AdminLayout,
  beforeLoad: ({ context }) => {
    if (!context.user.superAdmin) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: context.organizationId }
      });
    }
  }
});
