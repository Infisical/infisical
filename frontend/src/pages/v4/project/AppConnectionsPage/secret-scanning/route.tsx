import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { SecretScanningAppConnectionsPage } from "../AppConnectionsPage";
import { appConnectionsSearch } from "../search";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/app-connections")({
  staticData: { readiness: "full" },
  component: SecretScanningAppConnectionsPage,
  validateSearch: zodValidator(appConnectionsSearch),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
