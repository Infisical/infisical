import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { authenticateSession, injectOrgDetails } from "@app/helpers/routeGuards";

import type { V4Mode } from "../mode";
import { V4OrganizationLayout } from "./V4OrganizationLayout";

export const Route = createFileRoute("/v4/organizations/$orgId")({
  beforeLoad: async ({ context, params, location }) => {
    const { isV4AppEnabled, V4_DEMO_ORG_ID } = await import("../mode");
    if (params.orgId === V4_DEMO_ORG_ID) return { v4Mode: "demo" as V4Mode };
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const session = await authenticateSession({ context, location });
    const { organizationId } = await injectOrgDetails({
      context: { ...context, ...session },
      params,
      location
    });
    return { ...session, organizationId, v4Mode: "live" as V4Mode };
  },
  component: V4OrganizationLayout,
  pendingComponent: lazyRouteComponent(() => import("../V4PageLoader"), "V4PageLoader")
});
