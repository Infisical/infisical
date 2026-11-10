import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretSharingPage } from "./SecretSharingPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/secret-sharing"
)({
  staticData: { readiness: "full" },
  component: SecretSharingPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().catch("").optional(),
      subOrganization: z.string().optional().catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
