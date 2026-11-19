import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamAuditLogsPage } from "@app/pages/pam/PamAuditLogsPage/PamAuditLogsPage";

import { ProjectAuditLogsTab } from "./components";

const AuditLogsPageQueryParams = z.object({
  selectedTab: z.nativeEnum(ProjectAuditLogsTab).catch(ProjectAuditLogsTab.AuditLogs)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/audit-logs"
)({
  component: PamAuditLogsPage,
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
