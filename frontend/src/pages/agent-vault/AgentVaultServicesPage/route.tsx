import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultServicesPage } from "./AgentVaultServicesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/services"
)({
  component: AgentVaultServicesPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Services" }] };
  }
});
