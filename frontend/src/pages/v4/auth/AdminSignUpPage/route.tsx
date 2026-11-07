import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { AdminSignUpPage } from "./AdminSignUpPage";

export const Route = createFileRoute("/v4/_v4-auth/admin/signup")({
  beforeLoad: ({ context }) => {
    if (context.authPreview) return;
    if (context.serverConfig.initialized) throw redirect({ to: "/v4/login" });
  },
  component: AdminSignUpPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
