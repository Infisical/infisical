import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SelectIntegrationAuthRedirect } from "../LegacyIntegrationRedirect/LegacyIntegrationRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/select-integration-auth"
)({
  staticData: { readiness: "full" },
  component: SelectIntegrationAuthRedirect,
  validateSearch: zodValidator(
    z.object({ integrationSlug: z.string().optional().catch(undefined) })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
