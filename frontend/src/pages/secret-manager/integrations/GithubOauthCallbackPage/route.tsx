import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GithubOauthCallbackPage } from "./GithubOauthCallbackPage";

export const GithubOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/github/oauth2/callback"
)({
  component: GithubOauthCallbackPage,
  validateSearch: zodValidator(GithubOAuthCallbackPageQueryParamsSchema)
});
