import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authenticateSession } from "@app/helpers/routeGuards";

import { OrgOnboardingPage } from "./OrgOnboardingPage";

const QueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  preview: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/organizations/onboarding")({
  validateSearch: zodValidator(QueryParamsSchema),
  beforeLoad: async ({ context, location, search }) => {
    const { canPreviewV4States, isV4AppEnabled } = await import("../../mode");
    if (search.preview && canPreviewV4States()) return;
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("../paths");
    await withV4Redirects(() => authenticateSession({ context, location: toV3Location(location) }));
  },
  component: OrgOnboardingPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
