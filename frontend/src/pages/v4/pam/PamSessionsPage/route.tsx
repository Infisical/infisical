import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PamSessionsPage } from "./PamSessionsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/sessions")({
  staticData: { readiness: "partial", missing: ["Session details", "Session replay"] },
  component: PamSessionsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
