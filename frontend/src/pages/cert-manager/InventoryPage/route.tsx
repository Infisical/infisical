import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/inventory"
)({
  component: InventoryPage,
  validateSearch: zodValidator(inventoryPageSearchSchema),
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Inventory" }]
  })
});
