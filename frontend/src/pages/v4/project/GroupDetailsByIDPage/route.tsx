import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/groups/$groupId"
)({
  staticData: { readiness: "full" },
  component: GroupDetailsByIDPage,
  validateSearch: zodValidator(
    z.object({
      username: z.string().optional().catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
