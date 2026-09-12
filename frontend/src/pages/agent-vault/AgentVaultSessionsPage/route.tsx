import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultSessionsPage } from "./AgentVaultSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/sessions"
)({
  component: AgentVaultSessionsPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Sessions" }] };
  }
});
