import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultActivityLogsPage } from "./AgentVaultActivityLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/activity-logs"
)({
  component: AgentVaultActivityLogsPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Activity Logs" }] };
  }
});
