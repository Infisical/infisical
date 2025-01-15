import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/audit-logs"
)({
  component: AuditLogsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "home",
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Audit Logs"
      }
    ]
  })
});
