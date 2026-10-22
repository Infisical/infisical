import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AuditLogsPage } from "./AuditLogsPage";
import { ProjectAuditLogsTab } from "./components";

const AuditLogsPageQueryParams = z.object({
  selectedTab: z.nativeEnum(ProjectAuditLogsTab).catch(ProjectAuditLogsTab.AuditLogs)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/audit-logs"
)({
  component: AuditLogsPage,
  validateSearch: zodValidator(AuditLogsPageQueryParams),
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
