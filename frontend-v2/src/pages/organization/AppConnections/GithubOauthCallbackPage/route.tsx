import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubOAuthCallbackPage } from "./GithubOauthCallbackPage";

const GitHubOAuthCallbackPageQueryParamsSchema = z.object({
  code: z.string(),
  state: z.string(),
  installation_id: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/app-connections/github/oauth/callback"
)({
  component: GitHubOAuthCallbackPage,
  validateSearch: zodValidator(GitHubOAuthCallbackPageQueryParamsSchema)
});
