import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { HerokuOAuthCallbackPage } from "./HerokuOauthCallbackPage";

export const HerokuOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/heroku/oauth2/callback"
)({
  component: HerokuOAuthCallbackPage,
  validateSearch: zodValidator(HerokuOAuthCallbackPageQueryParamsSchema)
});
