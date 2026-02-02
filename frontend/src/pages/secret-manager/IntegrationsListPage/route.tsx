import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsListPage } from "./IntegrationsListPage";

const IntegrationsListPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(IntegrationsListPageTabs).optional(),
  addSync: z.nativeEnum(SecretSync).optional(),
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage,
  validateSearch: zodValidator(IntegrationsListPageQuerySchema),
  beforeLoad: async ({ context, search, params: { projectId, orgId } }) => {
    if (!search.selectedTab) {
      // Default to App Connections tab
      throw redirect({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: { orgId, projectId },
        search: { selectedTab: IntegrationsListPageTabs.AppConnections }
      });
    }

    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations"
        }
      ]
    };
  }
});
