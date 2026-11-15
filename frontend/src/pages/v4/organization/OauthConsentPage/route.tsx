import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authenticateSession } from "@app/helpers/routeGuards";

import { OauthConsentPage } from "./OauthConsentPage";

const SearchSchema = z.object({
  response_type: z.string(),
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  scope: z.string().optional(),
  org: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/organization/oauth-consent")({
  validateSearch: zodValidator(SearchSchema),
  beforeLoad: async ({ context, location, search }) => {
    const { isV4AppEnabled, V4_DEMO_ORG_ID } = await import("../../mode");
    if (search.org === V4_DEMO_ORG_ID) {
      const { demoAdapters } = await import("../../data/demo");
      return { v4Mode: "demo" as const, adapters: demoAdapters };
    }
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("../../auth/paths");
    await withV4Redirects(() => authenticateSession({ context, location: toV3Location(location) }));
    const { liveAdapters } = await import("../../data/live");
    return { v4Mode: "live" as const, adapters: liveAdapters };
  },
  staticData: { readiness: "full" },
  component: OauthConsentPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
