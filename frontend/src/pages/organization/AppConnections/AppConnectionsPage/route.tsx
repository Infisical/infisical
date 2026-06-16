import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/"
)({
  validateSearch: z.object({
    error: z.string().optional(),
    success: z.string().optional(),
    connectionId: z.string().optional(),
    // Set after creating a new GitHub App so we reopen the Add Connection modal to that app's form.
    addConnectionApp: z.nativeEnum(AppConnection).optional()
  }),
  // The standalone App Connections page moved into the org-level Integrations page. OAuth and
  // GitHub manifest callbacks still return here, so forward their params along.
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/integrations",
      params: { orgId: params.orgId },
      search: { ...search, selectedTab: IntegrationsListPageTabs.AppConnections }
    });
  }
});
