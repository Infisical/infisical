import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$orgId/agent-vault/sessions",
      params: { orgId: params.orgId }
    });
  }
});
