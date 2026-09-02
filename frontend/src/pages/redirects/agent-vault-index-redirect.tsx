import { createFileRoute, redirect } from "@tanstack/react-router";

// Sessions is the product landing page; /agent-vault on its own matches nothing without this.
export const Route = createFileRoute("/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$orgId/agent-vault/sessions",
      params: { orgId: params.orgId }
    });
  }
});
