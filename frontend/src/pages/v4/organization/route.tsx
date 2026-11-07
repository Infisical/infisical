import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { authenticateSession, injectOrgDetails } from "@app/helpers/routeGuards";
import { hasV3Page, toV3Href, v4Readiness } from "@app/helpers/v4Bridge";

import { V4OrganizationLayout } from "./V4OrganizationLayout";

export const Route = createFileRoute("/v4/organizations/$orgId")({
  beforeLoad: async ({ context, params, location, matches }) => {
    const { isV4AppEnabled, V4_DEMO_ORG_ID } = await import("../mode");
    if (params.orgId === V4_DEMO_ORG_ID) {
      const { demoAdapters } = await import("../data/demo");
      return { v4Mode: "demo" as const, adapters: demoAdapters };
    }
    if (
      !(await isV4AppEnabled()) ||
      (v4Readiness(matches) === "none" && hasV3Page(toV3Href(location.pathname)))
    ) {
      throw redirect({ href: toV3Href(location.href), replace: true });
    }
    const { withV4Redirects } = await import("../auth/paths");
    const session = await withV4Redirects(() => authenticateSession({ context, location }));
    const { organizationId } = await withV4Redirects(() =>
      injectOrgDetails({ context: { ...context, ...session }, params, location })
    );
    const { liveAdapters } = await import("../data/live");
    return { ...session, organizationId, v4Mode: "live" as const, adapters: liveAdapters };
  },
  component: V4OrganizationLayout,
  pendingComponent: lazyRouteComponent(() => import("../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../V4ErrorPage"), "V4ErrorPage"),
  notFoundComponent: lazyRouteComponent(() => import("../V4NotFoundPage"), "V4NotFoundPage")
});
