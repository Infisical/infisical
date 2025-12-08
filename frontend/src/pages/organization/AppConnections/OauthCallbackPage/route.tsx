import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OAuthCallbackPage } from "./OauthCallbackPage";

const GitHubOAuthCallbackPageQueryParamsSchema = z.object({
  code: z.coerce.string().catch(""),
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/$appConnection/oauth/callback"
)({
  component: OAuthCallbackPage,
  validateSearch: zodValidator(GitHubOAuthCallbackPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ state: "", installation_id: "" })]
  }
});
