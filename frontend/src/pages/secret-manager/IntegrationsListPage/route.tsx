import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { projectKeys } from "@app/hooks/api";
import { TIntegration } from "@app/hooks/api/integrations/types";
import { fetchWorkspaceIntegrations } from "@app/hooks/api/projects/queries";
import {
  fetchSecretSyncsByProjectId,
  SecretSync,
  secretSyncKeys,
  TSecretSync
} from "@app/hooks/api/secretSyncs";
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
      let secretSyncs: TSecretSync[];

      try {
        secretSyncs = await context.queryClient.ensureQueryData({
          queryKey: secretSyncKeys.list(projectId),
          queryFn: () => fetchSecretSyncsByProjectId(projectId)
        });
      } catch {
        throw redirect({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
          params: { orgId, projectId },
          search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
        });
      }

      if (secretSyncs.length) {
        throw redirect({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
          params: { orgId, projectId },
          search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
        });
      }

      let integrations: TIntegration[];
      try {
        integrations = await context.queryClient.ensureQueryData({
          queryKey: projectKeys.getProjectIntegrations(projectId),
          queryFn: () => fetchWorkspaceIntegrations(projectId)
        });
      } catch {
        throw redirect({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
          params: {
            orgId,
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
        });
      }

      if (integrations.length) {
        throw redirect({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
          params: {
            orgId,
            projectId
          },
          search: { selectedTab: IntegrationsListPageTabs.NativeIntegrations }
        });
      }

      throw redirect({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId,
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
