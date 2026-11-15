import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectType } from "@app/hooks/api/projects/types";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { ProjectAuditLogsPage } from "../AuditLogsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/audit-logs")({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.SecretScanning, ProjectAuditLogsPage),
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("audit-logs") })),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
