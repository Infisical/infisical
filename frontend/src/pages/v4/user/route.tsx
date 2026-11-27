import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authenticateSession } from "@app/helpers/routeGuards";
import { fetchOrganizations, organizationKeys } from "@app/hooks/api/organization/queries";

import { V4PersonalSettingsLayout } from "./V4PersonalSettingsLayout";

const SearchSchema = z.object({
  selectedTab: z.enum(["general", "authentication", "api-keys"]).catch("general"),
  org: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/personal-settings")({
  validateSearch: zodValidator(SearchSchema),
  beforeLoad: async ({ context, location, search }) => {
    const { isV4AppEnabled, V4_DEMO_ORG_ID } = await import("../mode");
    if (search.org === V4_DEMO_ORG_ID) {
      const [{ personalDemo }, { demoAdapters }] = await Promise.all([
        import("../data/personal/demo"),
        import("../data/demo")
      ]);
      return {
        v4Mode: "demo" as const,
        adapters: demoAdapters,
        organizationId: V4_DEMO_ORG_ID,
        personal: personalDemo
      };
    }
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("../auth/paths");
    const session = await withV4Redirects(() =>
      authenticateSession({ context, location: toV3Location(location) })
    );
    await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getUserOrganizations,
      queryFn: fetchOrganizations
    });
    const [{ personalLive }, { liveAdapters }] = await Promise.all([
      import("../data/personal/live"),
      import("../data/live")
    ]);
    return {
      v4Mode: "live" as const,
      adapters: liveAdapters,
      organizationId: session.organizationId,
      personal: personalLive
    };
  },
  component: V4PersonalSettingsLayout,
  pendingMs: Infinity,
  pendingComponent: lazyRouteComponent(() => import("../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../V4ErrorPage"), "V4ErrorPage")
});
