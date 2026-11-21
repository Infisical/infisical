import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProductSettingsPage } from "./ProductSettingsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/product-settings/"
)({
  staticData: { readiness: "full" },
  component: ProductSettingsPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
