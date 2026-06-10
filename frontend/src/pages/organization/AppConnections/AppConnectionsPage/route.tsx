import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionsPage } from "./AppConnectionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/"
)({
  component: AppConnectionsPage,
  validateSearch: z.object({
    error: z.string().optional(),
    success: z.string().optional(),
    connectionId: z.string().optional(),
    // Set after creating a new GitHub App so we reopen the Add Connection modal to that app's form.
    addConnectionApp: z.nativeEnum(AppConnection).optional()
  }),
  context: () => ({
    breadcrumbs: [
      {
        label: "App Connections"
      }
    ]
  })
});
