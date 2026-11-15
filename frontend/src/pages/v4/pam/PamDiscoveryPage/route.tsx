import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamDiscoveryPage } from "./PamDiscoveryPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/discovery")({
  staticData: { readiness: "full" },
  component: PamDiscoveryPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
