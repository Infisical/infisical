import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SignUpPage } from "./SignUpPage";

export const Route = createFileRoute("/v4/_v4-auth/signup/")({
  component: SignUpPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
