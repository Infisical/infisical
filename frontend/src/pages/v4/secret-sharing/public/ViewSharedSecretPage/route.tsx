import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ViewSharedSecretPage } from "./ViewSharedSecretPage";

export const Route = createFileRoute("/v4/_v4-public/shared/secret/$secretId")({
  staticData: { readiness: "full" },
  component: ViewSharedSecretPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
