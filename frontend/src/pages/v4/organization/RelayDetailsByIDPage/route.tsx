import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RelayDetailsByIDPage } from "./RelayDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/networking/relays/$relayId")({
  staticData: { readiness: "full" },
  component: RelayDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
