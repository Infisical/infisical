import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ApplicationsPage } from "./ApplicationsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/applications/")({
  staticData: {
    readiness: "partial",
    missing: ["Create a certificate profile from the profile picker"]
  },
  component: ApplicationsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
