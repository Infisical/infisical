import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ShareSecretPage } from "./ShareSecretPage";

export const Route = createFileRoute("/v4/_v4-public/shared/new")({
  staticData: { readiness: "full" },
  component: ShareSecretPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
