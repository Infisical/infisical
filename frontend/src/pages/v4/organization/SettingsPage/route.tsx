import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/settings")({
  staticData: {
    readiness: "partial",
    missing: ["Security", "Encryption", "Product settings", "Sub organizations"]
  },
  component: SettingsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("") })),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
