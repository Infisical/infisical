import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/settings/oauth/callback"
)({
  beforeLoad: ({ context, search }) => {
    throw redirect({
      to: "/organizations/$orgId/settings/oauth/callback",
      params: {
        orgId: context.organizationId
      },
      search
    });
  }
});
