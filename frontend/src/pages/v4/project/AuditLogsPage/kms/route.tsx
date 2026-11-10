import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectAuditLogsPage } from "../AuditLogsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/audit-logs")(
  {
    staticData: { readiness: "full" },
    component: ProjectAuditLogsPage,
    validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("audit-logs") })),
    errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
  }
);
