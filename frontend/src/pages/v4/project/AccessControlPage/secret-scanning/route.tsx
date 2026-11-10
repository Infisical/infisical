import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { AccessControlPage } from "../AccessControlPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/access-management")({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.SecretScanning, AccessControlPage),
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member),
      requesterEmail: z.string().catch("")
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
