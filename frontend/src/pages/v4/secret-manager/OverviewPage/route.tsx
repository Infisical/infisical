import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OverviewPage } from "./OverviewPage";

const SecretOverviewPageQuerySchema = z.object({
  search: z.string().catch(""),
  clearSearch: z.boolean().optional(),
  secretPath: z.string().catch("/"),
  connectionId: z.string().optional(),
  connectionName: z.string().optional(),
  environments: z.array(z.string()).catch([]),
  dynamicSecretId: z.string().optional(),
  honeyTokenId: z.string().optional(),
  tags: z.string().optional(),
  filterBy: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/overview"
)({
  component: OverviewPage,
  validateSearch: zodValidator(SecretOverviewPageQuerySchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
