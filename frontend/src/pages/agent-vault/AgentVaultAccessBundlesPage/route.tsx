import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultAccessBundlesPage } from "./AgentVaultAccessBundlesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/access-bundles/"
)({
  component: AgentVaultAccessBundlesPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Access Bundles" }] };
  }
});
