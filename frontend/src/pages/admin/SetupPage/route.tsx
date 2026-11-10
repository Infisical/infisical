import { createFileRoute, redirect } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { SetupPage } from "./SetupPage";

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/setup")({
  component: SetupPage,
  beforeLoad: async ({ context, location }) => {
    if (!context.user.superAdmin) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: context.organizationId }
      });
    }
    await handoffToV4(location);
  }
});
