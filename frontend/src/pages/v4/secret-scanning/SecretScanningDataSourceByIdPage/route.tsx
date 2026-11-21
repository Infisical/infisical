import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2/enums";

import { SecretScanningDataSourceByIdPage } from "./SecretScanningDataSourceByIdPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/secret-scanning/data-sources/$type/$dataSourceId"
)({
  staticData: { readiness: "full" },
  component: SecretScanningDataSourceByIdPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z
        .enum(["findings", "resources", "scan-history", "settings"])
        .optional()
        .catch(undefined),
      resourceId: z.string().uuid().optional().catch(undefined),
      status: z
        .union([z.nativeEnum(SecretScanningFindingStatus), z.literal("all")])
        .optional()
        .catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
