import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubManifestCallbackPage } from "./GitHubManifestCallbackPage";

const GitHubManifestCallbackQueryParamsSchema = z.object({
  code: z.coerce.string().catch(""),
  state: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/github/manifest/callback"
)({
  component: GitHubManifestCallbackPage,
  validateSearch: zodValidator(GitHubManifestCallbackQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ state: "" })]
  }
});
