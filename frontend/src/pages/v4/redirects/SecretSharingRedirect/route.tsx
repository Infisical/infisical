import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretSharingRedirect } from "./SecretSharingRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-sharing")({
  validateSearch: zodValidator(z.object({ selectedTab: z.string().optional().catch(undefined) })),
  staticData: { readiness: "full" },
  component: SecretSharingRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
