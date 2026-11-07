import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPage } from "./SecretDashboardPage";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch(""),
  filterBy: z.string().catch(""),
  dynamicSecretId: z.string().catch(""),
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
)({
  staticData: { readiness: "full" },
  component: SecretDashboardPage,
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
