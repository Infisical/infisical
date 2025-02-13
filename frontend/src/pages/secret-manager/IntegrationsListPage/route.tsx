import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { workspaceKeys } from "@app/hooks/api";
import { fetchSecretSyncsByProjectId, secretSyncKeys } from "@app/hooks/api/secretSyncs";
import { fetchWorkspaceIntegrations } from "@app/hooks/api/workspace/queries";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsListPage } from "./IntegrationsListPage";

const IntegrationsListPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(IntegrationsListPageTabs).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage,
  validateSearch: zodValidator(IntegrationsListPageQuerySchema),
  beforeLoad: async ({ context, search, params: { projectId } }) => {
    if (!search.selectedTab) {
      try {
        const secretSyncs = await context.queryClient.ensureQueryData({
          queryKey: secretSyncKeys.list(projectId),
          queryFn: () => fetchSecretSyncsByProjectId(projectId)
        });

        if (secretSyncs.length) {
          throw redirect({
            to: "/secret-manager/$projectId/integrations",
            params: {
              projectId
            },
            search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
          });
        }

        const integrations = await context.queryClient.ensureQueryData({
          queryKey: workspaceKeys.getWorkspaceIntegrations(projectId),
          queryFn: () => fetchWorkspaceIntegrations(projectId)
        });

        if (integrations.length) {
          throw redirect({
            to: "/secret-manager/$projectId/integrations",
            params: {
              projectId
            },
            search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
          });
        }

        throw redirect({
          to: "/secret-manager/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
        });
      } catch {
        throw redirect({
          to: "/secret-manager/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
        });
      }
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
