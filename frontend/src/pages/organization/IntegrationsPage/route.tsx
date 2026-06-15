import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsPage } from "./IntegrationsPage";

const IntegrationsPageQuerySchema = z.object({
  selectedTab: z.string().catch(IntegrationsListPageTabs.AppConnections),
  error: z.string().optional(),
  success: z.string().optional(),
  connectionId: z.string().optional(),
  // Set after creating a new GitHub App so we reopen the Add Connection modal to that app's form.
  addConnectionApp: z.nativeEnum(AppConnection).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/integrations"
)({
  component: IntegrationsPage,
  validateSearch: zodValidator(IntegrationsPageQuerySchema),
  context: () => ({
    breadcrumbs: [
      {
        label: "Integrations"
      }
    ]
  })
});
