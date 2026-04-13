import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/app-connections/$appConnection/oauth/callback"
)({
  beforeLoad: ({ context, params, search }) => {
    const orgId = context.organizationId;

    if (!orgId) {
      throw redirect({
        to: "/login/select-organization"
      });
    }

    throw redirect({
      to: "/organizations/$orgId/app-connections/$appConnection/oauth/callback",
      params: {
        orgId,
        appConnection: params.appConnection
      },
      search
    });
  }
});
