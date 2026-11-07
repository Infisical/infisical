import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OrgAccessControlTabSections } from "@app/types/org";

import { AccessManagementPage } from "./AccessManagementPage";

export const Route = createFileRoute("/v4/organizations/$orgId/access-management")({
  staticData: { readiness: "full" },
  component: AccessManagementPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().catch(OrgAccessControlTabSections.Member),
      action: z.string().catch("")
    })
  ),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
