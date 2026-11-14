import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ResourceOverviewPage } from "./ResourceOverviewPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/resources/overview")({
  staticData: { readiness: "full" },
  component: ResourceOverviewPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().optional().catch(undefined) })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
