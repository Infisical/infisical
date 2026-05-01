import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/app-connections/$appConnection/oauth/callback"
)({
  beforeLoad: ({ context, params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/app-connections/$appConnection/oauth/callback",
      params: {
        orgId: context.organizationId,
        appConnection: params.appConnection
      },
      search
    });
  }
});
