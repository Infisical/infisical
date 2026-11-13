import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ExpiringPage } from "./ExpiringPage";

const expiringPageSearchSchema = z.object({
  view: z.enum(["all", "action"]).optional(),
  scenario: z.string().optional()
});

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/expiring")({
  staticData: { readiness: "full" },
  component: ExpiringPage,
  validateSearch: zodValidator(expiringPageSearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
