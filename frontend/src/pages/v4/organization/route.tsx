import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { authenticateSession, injectOrgDetails } from "@app/helpers/routeGuards";
import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";
import { fetchOrganizations, organizationKeys } from "@app/hooks/api/organization/queries";

import { V4OrganizationLayout } from "./V4OrganizationLayout";

export const Route = createFileRoute("/v4/organizations/$orgId")({
  beforeLoad: async ({ context, params, location, matches }) => {
    const { isV4AppEnabled, V4_DEMO_ORG_ID } = await import("../mode");
    if (params.orgId === V4_DEMO_ORG_ID) {
      const { demoAdapters } = await import("../data/demo");
      return { v4Mode: "demo" as const, adapters: demoAdapters };
    }
    const { liveHref } = await import("../liveReady");
    const notPorted = matches.at(-1)?.routeId.endsWith("/$") ?? false;
    if (
      !(await isV4AppEnabled()) ||
      (!notPorted && liveHref(location.pathname) !== location.pathname)
    ) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { withV4Redirects } = await import("../auth/paths");
    const serverConfig =
      context.serverConfig ??
      (await context.queryClient.ensureQueryData({
        queryKey: adminQueryKeys.serverConfig(),
        queryFn: fetchServerConfig
      }));
    const session = await withV4Redirects(() =>
      authenticateSession({ context: { ...context, serverConfig }, location })
    );
    const { organizationId } = await withV4Redirects(() =>
      injectOrgDetails({ context: { ...context, ...session }, params, location })
    );
    await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getUserOrganizations,
      queryFn: fetchOrganizations
    });
    const { liveAdapters } = await import("../data/live");
    return { ...session, organizationId, v4Mode: "live" as const, adapters: liveAdapters };
  },
  component: V4OrganizationLayout,
  pendingMs: Infinity,
  pendingComponent: lazyRouteComponent(() => import("../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../V4ErrorPage"), "V4ErrorPage"),
  notFoundComponent: lazyRouteComponent(() => import("../V4NotFoundPage"), "V4NotFoundPage")
});
