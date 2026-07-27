import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticate/_inject-org-details/pam/access")({
  beforeLoad: ({ context }: { context: { organizationId: string } }) => {
    throw redirect({
      to: "/organizations/$orgId/pam/access",
      params: {
        orgId: context.organizationId
      }
    });
  }
});
