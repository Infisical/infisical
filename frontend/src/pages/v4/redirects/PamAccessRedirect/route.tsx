import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PamAccessRedirect } from "./PamAccessRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/access")({
  staticData: {
    readiness: "partial",
    missing: [
      "Add folder",
      "Add account",
      "Launch session",
      "Configure account",
      "Delete account",
      "Folder actions",
      "Folder view"
    ]
  },
  component: PamAccessRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
