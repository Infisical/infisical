import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/integrations/$syncId")({
  staticData: { readiness: "full" },
  validateSearch: zodValidator(z.object({ fromApplication: z.string().optional() })),
  component: lazyRouteComponent(() => import("./PkiSyncDetailsByIDPage"), "PkiSyncDetailsByIDPage"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
