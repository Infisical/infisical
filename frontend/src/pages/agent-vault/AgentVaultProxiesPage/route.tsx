import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultProxiesPage } from "./AgentVaultProxiesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/proxies"
)({
  component: AgentVaultProxiesPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Proxies" }] };
  }
});
