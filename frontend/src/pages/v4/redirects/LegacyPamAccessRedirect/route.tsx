import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { authenticateSession } from "@app/helpers/routeGuards";

import { LegacyPamAccessRedirect } from "./LegacyPamAccessRedirect";

export const Route = createFileRoute("/v4/pam/access")({
  beforeLoad: async ({ context, location }) => {
    const { isV4AppEnabled } = await import("../../mode");
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("../../auth/paths");
    const { organizationId } = await withV4Redirects(() =>
      authenticateSession({ context, location: toV3Location(location) })
    );
    return { organizationId: organizationId! };
  },
  staticData: { readiness: "full" },
  component: LegacyPamAccessRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
