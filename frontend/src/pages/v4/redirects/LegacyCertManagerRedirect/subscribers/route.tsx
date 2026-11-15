import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacySubscribersRedirect } from "../LegacyCertManagerRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/subscribers/")({
  staticData: { readiness: "full" },
  component: LegacySubscribersRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
