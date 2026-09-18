import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/app-connections/github/manifest/callback"
)({
  beforeLoad: ({ context, search }) => {
    throw redirect({
      to: "/organizations/$orgId/app-connections/github/manifest/callback",
      params: {
        orgId: context.organizationId
      },
      search
    });
  }
});
