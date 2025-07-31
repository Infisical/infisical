import { createFileRoute } from "@tanstack/react-router";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout/audit-logs"
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
