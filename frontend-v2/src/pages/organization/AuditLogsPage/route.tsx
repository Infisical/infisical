import { createFileRoute } from "@tanstack/react-router";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/audit-logs/"
)({
  component: AuditLogsPage
});
