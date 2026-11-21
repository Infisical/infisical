import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { IntegrationOauthCallbackPage } from "./IntegrationOauthCallbackPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/oauth2/callback"
)({
  staticData: { readiness: "full" },
  component: IntegrationOauthCallbackPage,
  validateSearch: zodValidator(
    z.object({
      code: z.coerce.string().catch(""),
      state: z.string().catch("")
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
