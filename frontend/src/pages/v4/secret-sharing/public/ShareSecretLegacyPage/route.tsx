import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ShareSecretLegacyRedirect } from "./ShareSecretLegacyRedirect";

export const Route = createFileRoute("/v4/_v4-public/share-secret")({
  staticData: { readiness: "full" },
  component: ShareSecretLegacyRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
