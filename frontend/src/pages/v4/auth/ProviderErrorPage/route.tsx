import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProviderErrorPage } from "./ProviderErrorPage";

export const Route = createFileRoute("/v4/_v4-auth/login/provider/error")({
  component: ProviderErrorPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
