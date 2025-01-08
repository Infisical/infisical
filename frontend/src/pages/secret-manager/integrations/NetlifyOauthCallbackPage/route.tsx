import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { NetlifyOauthCallbackPage } from "./NetlifyOauthCallbackPage";

export const NetlifyOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/netlify/oauth2/callback"
)({
  component: NetlifyOauthCallbackPage,
  validateSearch: zodValidator(NetlifyOAuthCallbackPageQueryParamsSchema)
});
