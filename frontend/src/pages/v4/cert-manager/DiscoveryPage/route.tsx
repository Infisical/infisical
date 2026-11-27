import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DiscoveryPage } from "./DiscoveryPage";

const SearchSchema = z.object({
  selectedTab: z.string().optional().default("jobs")
});

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/discovery/")({
  staticData: { readiness: "full" },
  component: DiscoveryPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
