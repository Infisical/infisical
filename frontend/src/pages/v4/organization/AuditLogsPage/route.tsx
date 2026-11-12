import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AuditLogsPage } from "./AuditLogsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/audit-logs")({
  staticData: { readiness: "partial", missing: ["Audit log settings"] },
  component: AuditLogsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("audit-logs") })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
