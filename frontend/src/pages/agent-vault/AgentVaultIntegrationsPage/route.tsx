import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultIntegrationsPage } from "./AgentVaultIntegrationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/integrations"
)({
  component: AgentVaultIntegrationsPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Integrations" }] };
  }
});
