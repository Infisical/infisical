import { createFileRoute } from "@tanstack/react-router";

import { AuditLogsPage } from "@app/pages/nexus/AuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/audit-logs"
)({
  component: AuditLogsPage,
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
