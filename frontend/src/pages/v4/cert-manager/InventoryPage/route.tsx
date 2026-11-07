import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { InventoryPage } from "./InventoryPage";

const inventoryPageSearchSchema = z.object({
  filterStatus: z.string().optional(),
  filterEnrollmentType: z.string().optional(),
  filterKeyAlgorithm: z.string().optional(),
  filterCaId: z.string().optional(),
  filterExpiresDays: z.string().optional(),
  filterExpiresAfterDays: z.string().optional(),
  viewId: z.string().optional()
});

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/inventory")({
  component: InventoryPage,
  validateSearch: zodValidator(inventoryPageSearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
