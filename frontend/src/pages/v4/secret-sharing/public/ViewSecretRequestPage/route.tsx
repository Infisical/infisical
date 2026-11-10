import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ViewSecretRequestPage } from "./ViewSecretRequestPage";

export const Route = createFileRoute("/v4/_v4-public/secret-request/secret/$secretRequestId")({
  staticData: { readiness: "full" },
  component: ViewSecretRequestPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
