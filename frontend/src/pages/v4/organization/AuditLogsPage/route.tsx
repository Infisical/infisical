import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/audit-logs")({
  component: AuditLogsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("audit-logs") }))
});
