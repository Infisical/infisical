import { createFileRoute } from "@tanstack/react-router";

import { AgentVaultAuditLogsPage } from "@app/pages/agent-vault/AgentVaultAuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/audit-logs"
)({
  component: AgentVaultAuditLogsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Audit Logs"
        }
      ]
    };
  }
});
