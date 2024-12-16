import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticate/_org_details/_org-layout/organization/")({
  beforeLoad: ({ context }) => {
    redirect({
      throw: true,
      to: "/organization/$organizationId/secret-manager",
      params: {
        organizationId: String(context.organizationId)
      }
    });
  }
});
