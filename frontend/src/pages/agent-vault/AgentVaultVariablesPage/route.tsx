import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultVariablesPage } from "./AgentVaultVariablesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/variables"
)({
  component: AgentVaultVariablesPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Variables" }] };
  }
});
