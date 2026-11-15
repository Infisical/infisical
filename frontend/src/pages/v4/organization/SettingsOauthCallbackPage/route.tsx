import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsOauthCallbackPage } from "./SettingsOauthCallbackPage";

const SettingsOauthCallbackSearchSchema = z.object({
  state: z
    .object({
      clientId: z.string(),
      tenantId: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      redirectUri: z.string(),
      csrfToken: z.string()
    })
    .nullable()
    .catch(null),
  code: z.string().catch("")
});

export const Route = createFileRoute("/v4/organizations/$orgId/settings/oauth/callback")({
  staticData: { readiness: "full" },
  component: SettingsOauthCallbackPage,
  validateSearch: zodValidator(SettingsOauthCallbackSearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
