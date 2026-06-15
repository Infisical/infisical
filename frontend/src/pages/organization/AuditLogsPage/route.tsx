import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AuditLogsPage } from "./AuditLogsPage";

const AuditLogsPageQueryParams = z.object({
  selectedTab: z.string().catch("").default("audit-logs")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/audit-logs"
)({
  component: AuditLogsPage,
  validateSearch: zodValidator(AuditLogsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Audit Logs"
      }
    ]
  })
});
