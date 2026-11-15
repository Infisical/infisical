import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamMyAccountsPage } from "./PamMyAccountsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/accounts/my-accounts")({
  staticData: {
    readiness: "partial",
    missing: [
      "Request access",
      "View credentials",
      "Account permissions",
      "Account rotation",
      "Account advanced overrides",
      "Credential health check"
    ]
  },
  component: PamMyAccountsPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
