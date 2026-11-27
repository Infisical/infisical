import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacySecretManagerApprovalRedirect } from "./LegacySecretManagerApprovalRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-manager/$projectId/approval")(
  {
    staticData: { readiness: "full" },
    component: LegacySecretManagerApprovalRedirect,
    errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
  }
);
