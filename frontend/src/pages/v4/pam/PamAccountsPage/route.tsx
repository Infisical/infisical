import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamAccountsPage } from "./PamAccountsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/accounts/")({
  component: PamAccountsPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
