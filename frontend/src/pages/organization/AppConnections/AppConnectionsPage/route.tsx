import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AppConnectionsPage } from "./AppConnectionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/"
)({
  component: AppConnectionsPage,
  validateSearch: z.object({
    error: z.string().optional(),
    success: z.string().optional(),
    connectionId: z.string().optional()
  }),
  context: () => ({
    breadcrumbs: [
      {
        label: "App Connections"
      }
    ]
  })
});
