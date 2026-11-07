import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectAccessControlTabs } from "@app/types/project";

import { AccessControlPage } from "../AccessControlPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/access-management"
)({
  staticData: { readiness: "full" },
  component: AccessControlPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member),
      requesterEmail: z.string().catch("")
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
