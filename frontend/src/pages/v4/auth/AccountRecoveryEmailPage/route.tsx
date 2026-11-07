import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AccountRecoveryEmailPage } from "./AccountRecoveryEmailPage";

export const Route = createFileRoute("/v4/_v4-auth/account-recovery")({
  component: AccountRecoveryEmailPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
