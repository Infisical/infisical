import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect legacy /pam/access route to the unified /pam/accounts page
export const Route = createFileRoute("/_authenticate/_inject-org-details/pam/access")({
  beforeLoad: ({ context }: { context: { organizationId: string } }) => {
    throw redirect({
      to: "/organizations/$orgId/pam/accounts",
      params: {
        orgId: context.organizationId
      }
    });
  }
});
