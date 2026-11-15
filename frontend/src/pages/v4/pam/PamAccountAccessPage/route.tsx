import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamAccountAccessPage } from "./PamAccountAccessPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
)({
  staticData: { readiness: "partial", missing: ["Data explorer"] },
  component: PamAccountAccessPage,
  validateSearch: zodValidator(z.object({ host: z.string().optional() })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
