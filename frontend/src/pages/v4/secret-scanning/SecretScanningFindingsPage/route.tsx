import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2/enums";

import { SecretScanningFindingsPage } from "./SecretScanningFindingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/findings")({
  staticData: { readiness: "partial", missing: ["Live sign-off"] },
  component: SecretScanningFindingsPage,
  validateSearch: zodValidator(
    z.object({
      dataSourceId: z.string().uuid().optional().catch(undefined),
      resourceId: z.string().uuid().optional().catch(undefined),
      status: z
        .union([z.nativeEnum(SecretScanningFindingStatus), z.literal("all")])
        .optional()
        .catch(undefined)
    })
  ),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
