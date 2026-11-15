import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamSessionsPage } from "./PamSessionsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/sessions")({
  staticData: { readiness: "full" },
  component: PamSessionsPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
