import { createFileRoute, redirect } from "@tanstack/react-router";

import { SetupPage } from "./SetupPage";

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/setup")({
  component: SetupPage,
  beforeLoad: ({ context }) => {
    if (!context.user.superAdmin) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: context.organizationId }
      });
    }
  }
});
