import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitHubManifestCallbackPage } from "./GitHubManifestCallbackPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/app-connections/github/manifest/callback"
)({
  staticData: { readiness: "full" },
  component: GitHubManifestCallbackPage,
  validateSearch: zodValidator(
    z.object({
      gitHubAppId: z.string().catch(""),
      slug: z.string().catch(""),
      installState: z.string().catch(""),
      instanceType: z.enum(["cloud", "server"]).catch("cloud"),
      host: z.string().catch("")
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
