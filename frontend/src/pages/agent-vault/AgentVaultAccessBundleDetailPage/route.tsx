import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultAccessBundleDetailPage } from "./AgentVaultAccessBundleDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/access-bundles/$accessBundleId"
)({
  component: AgentVaultAccessBundleDetailPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Access Bundle" }] };
  }
});
