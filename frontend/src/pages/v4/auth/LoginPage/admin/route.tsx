import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LoginPage } from "../LoginPage";

export const Route = createFileRoute("/v4/_v4-auth/login/admin")({
  component: () => <LoginPage isAdmin />,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader")
});
