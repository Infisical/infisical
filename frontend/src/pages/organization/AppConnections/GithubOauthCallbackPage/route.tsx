import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubOAuthCallbackPage } from "./GithubOauthCallbackPage";

const GitHubOAuthCallbackPageQueryParamsSchema = z.object({
  code: z.coerce.string().catch(""),
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/app-connections/github/oauth/callback"
)({
  component: GitHubOAuthCallbackPage,
  validateSearch: zodValidator(GitHubOAuthCallbackPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ state: "", installation_id: "" })]
  }
});
