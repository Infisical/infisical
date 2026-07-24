import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect legacy /pam/access route to the unified /pam/accounts page
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/access/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$orgId/pam/accounts",
      params: { orgId: params.orgId }
    });
  }
});
