import { createFileRoute } from "@tanstack/react-router";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/audit-logs"
)({
  component: AuditLogsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Audit Logs"
      }
    ]
  })
});
