import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authenticateSession } from "@app/helpers/routeGuards";

import { AgentVaultOAuthCallbackPage } from "./AgentVaultOAuthCallbackPage";

const authorizationIdSchema = z.string().uuid();

const SearchSchema = z.object({
  code: z.string().max(4096).optional().catch(undefined),
  state: z
    .string()
    .min(1)
    .max(256)
    .refine((state) => authorizationIdSchema.safeParse(state.split(".")[0]).success)
    .optional()
    .catch(undefined),
  iss: z.string().max(2048).optional().catch(undefined),
  error: z.string().max(1024).optional().catch(undefined),
  error_description: z.string().max(4096).optional().catch(undefined),
  org: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/agent-vault/oauth/callback")({
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
  component: AgentVaultOAuthCallbackPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
