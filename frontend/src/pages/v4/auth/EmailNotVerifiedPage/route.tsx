import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { EmailNotVerifiedPage } from "./EmailNotVerifiedPage";

export const Route = createFileRoute("/v4/_v4-auth/email-not-verified")({
  component: EmailNotVerifiedPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
