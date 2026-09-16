import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultSettingsPage } from "./AgentVaultSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/settings"
)({
  component: AgentVaultSettingsPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Settings" }] };
  }
});
