import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitLabOAuthCallbackPage } from "./GitlabOauthCallbackPage";

export const GitlabOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gitlab/oauth2/callback"
)({
  component: GitLabOAuthCallbackPage,
  validateSearch: zodValidator(GitlabOAuthCallbackPageQueryParamsSchema)
});
