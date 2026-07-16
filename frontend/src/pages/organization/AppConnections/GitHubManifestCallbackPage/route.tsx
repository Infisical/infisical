import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubManifestCallbackPage } from "./GitHubManifestCallbackPage";

const GitHubManifestCallbackQueryParamsSchema = z.object({
  gitHubAppId: z.string().catch(""),
  slug: z.string().catch(""),
  installState: z.string().catch(""),
  instanceType: z.enum(["cloud", "server"]).catch("cloud"),
  host: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/github/manifest/callback"
)({
  component: GitHubManifestCallbackPage,
  validateSearch: zodValidator(GitHubManifestCallbackQueryParamsSchema)
});
