import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { NetworkingPage } from "./NetworkingPage";

export const Route = createFileRoute("/v4/organizations/$orgId/networking/")({
  staticData: { readiness: "full" },
  component: NetworkingPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.enum(["gateways", "relays"]).catch("gateways"),
      gatewayView: z.enum(["all-gateways", "gateway-pools"]).optional().catch(undefined),
      action: z.string().optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
