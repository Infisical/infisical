import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OAuthCallbackPage } from "./OauthCallbackPage";

const SettingsOAuthCallbackPageQueryParamsSchema = z.object({
  state: z
    .object({
      tenantId: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      redirectUri: z.string(),
      csrfToken: z.string()
    })
    .nullable()
    .catch(null),
  tenant: z.string().catch(""),
  admin_consent: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/settings/oauth/callback"
)({
  component: OAuthCallbackPage,
  validateSearch: zodValidator(SettingsOAuthCallbackPageQueryParamsSchema)
});
