import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnectionOauthCallbackPage } from "./AppConnectionOauthCallbackPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/app-connections/$appConnection/oauth/callback"
)({
  staticData: { readiness: "full" },
  component: AppConnectionOauthCallbackPage,
  validateSearch: zodValidator(
    z.object({
      code: z.coerce.string().catch(""),
      state: z.string().catch(""),
      installation_id: z.coerce.string().optional().catch(undefined),
      setup_action: z.string().optional().catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
