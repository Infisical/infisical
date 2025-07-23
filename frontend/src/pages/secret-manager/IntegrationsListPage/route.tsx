import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { workspaceKeys } from "@app/hooks/api";
import { TIntegration } from "@app/hooks/api/integrations/types";
import {
  fetchSecretSyncsByProjectId,
  SecretSync,
  secretSyncKeys,
  TSecretSync
} from "@app/hooks/api/secretSyncs";
import { fetchWorkspaceIntegrations } from "@app/hooks/api/workspace/queries";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsListPage } from "./IntegrationsListPage";

const IntegrationsListPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(IntegrationsListPageTabs).optional(),
  addSync: z.nativeEnum(SecretSync).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage,
  validateSearch: zodValidator(IntegrationsListPageQuerySchema),
  beforeLoad: async ({ context, search, params: { projectId } }) => {
    if (!search.selectedTab) {
      let secretSyncs: TSecretSync[];

      try {
        secretSyncs = await context.queryClient.ensureQueryData({
          queryKey: secretSyncKeys.list(projectId),
          queryFn: () => fetchSecretSyncsByProjectId(projectId)
        });
      } catch {
        throw redirect({
          to: "/projects/secret-management/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
        });
      }

      if (secretSyncs.length) {
        throw redirect({
          to: "/projects/secret-management/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
        });
      }

      let integrations: TIntegration[];
      try {
        integrations = await context.queryClient.ensureQueryData({
          queryKey: workspaceKeys.getWorkspaceIntegrations(projectId),
          queryFn: () => fetchWorkspaceIntegrations(projectId)
        });
      } catch {
        throw redirect({
          to: "/projects/secret-management/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
        });
      }

      if (integrations.length) {
        throw redirect({
          to: "/projects/secret-management/$projectId/integrations",
          params: {
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
        });
      }

      throw redirect({
        to: "/projects/secret-management/$projectId/integrations",
        params: {
          projectId
        },
        search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
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
