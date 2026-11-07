import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { authenticateSession } from "@app/helpers/routeGuards";

import { MfaSessionPage } from "./MfaSessionPage";

export const Route = createFileRoute("/v4/mfa-session/$mfaSessionId")({
  beforeLoad: async ({ context, location }) => {
    const { isV4AppEnabled } = await import("../../mode");
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("../paths");
    await withV4Redirects(() => authenticateSession({ context, location: toV3Location(location) }));
  },
  component: MfaSessionPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
