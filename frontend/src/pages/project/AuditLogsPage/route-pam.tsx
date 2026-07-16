import { createFileRoute } from "@tanstack/react-router";

import { PamAuditLogsPage } from "@app/pages/pam/PamAuditLogsPage/PamAuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/audit-logs"
)({
  component: PamAuditLogsPage,
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
