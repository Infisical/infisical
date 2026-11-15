import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamTemplatesPage } from "./PamTemplatesPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/templates")({
  staticData: { readiness: "full" },
  component: PamTemplatesPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
