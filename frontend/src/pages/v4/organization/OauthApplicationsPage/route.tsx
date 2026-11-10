import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OauthApplicationsPage } from "./OauthApplicationsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/oauth-applications")({
  staticData: { readiness: "partial", missing: ["OAuth applications"] },
  component: OauthApplicationsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("") })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
