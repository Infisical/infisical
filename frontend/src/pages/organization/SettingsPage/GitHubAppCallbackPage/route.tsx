import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubAppCallbackPage } from "./GitHubAppCallbackPage";

const GitHubAppCallbackPageQueryParams = z.object({
  code: z.string().optional(),
  state: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/settings/github-app/callback"
)({
  component: GitHubAppCallbackPage,
  validateSearch: zodValidator(GitHubAppCallbackPageQueryParams)
});
