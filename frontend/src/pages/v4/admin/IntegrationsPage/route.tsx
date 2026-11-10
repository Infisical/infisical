import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IntegrationsPage } from "./IntegrationsPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/integrations")({
  staticData: { readiness: "none" },
  component: IntegrationsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
