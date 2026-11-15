import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CodeSigningPage } from "./CodeSigningPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/code-signing/")({
  staticData: { readiness: "full" },
  component: CodeSigningPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
