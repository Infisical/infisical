import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SsoPage } from "./SsoPage";

export const Route = createFileRoute("/v4/organizations/$orgId/sso")({
  staticData: { readiness: "partial", missing: ["SSO", "Provisioning"] },
  component: SsoPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("") })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
