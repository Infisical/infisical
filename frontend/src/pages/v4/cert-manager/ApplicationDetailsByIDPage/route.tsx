import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApplicationDetailsByIDPage } from "./ApplicationDetailsByIDPage";

const SearchSchema = z.object({
  selectedTab: z.enum(["certificates", "requests", "syncs", "members", "settings"]).optional(),
  search: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/applications/$applicationName"
)({
  staticData: {
    readiness: "partial",
    missing: [
      "Create approval policies",
      "Create and edit application alerts"
    ]
  },
  component: ApplicationDetailsByIDPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
