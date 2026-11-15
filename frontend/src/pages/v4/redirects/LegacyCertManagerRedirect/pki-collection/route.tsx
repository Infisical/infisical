import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacyPkiCollectionRedirect } from "../LegacyCertManagerRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/pki-collections/$collectionId"
)({
  staticData: { readiness: "full" },
  component: LegacyPkiCollectionRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
