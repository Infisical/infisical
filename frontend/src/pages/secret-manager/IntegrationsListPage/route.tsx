import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { projectKeys } from "@app/hooks/api";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
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
  connectionName: z.string().optional(),
  addConnectionApp: z.nativeEnum(AppConnection).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage,
  validateSearch: zodValidator(IntegrationsListPageQuerySchema),
  beforeLoad: async ({ context, search, params: { projectId, orgId } }) => {
    const redirectToTab = (selectedTab: IntegrationsListPageTabs) =>
      redirect({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: { orgId, projectId },
        search: { selectedTab }
      });

    const getIntegrations = () =>
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectIntegrations(projectId),
        queryFn: () => fetchWorkspaceIntegrations(projectId)
      });

    if (!search.selectedTab) {
      let secretSyncs: TSecretSync[];

      try {
        secretSyncs = await context.queryClient.ensureQueryData({
          queryKey: secretSyncKeys.list(projectId),
          queryFn: () => fetchSecretSyncsByProjectId(projectId)
        });
      } catch {
        throw redirectToTab(IntegrationsListPageTabs.NativeIntegrations);
      }

      if (secretSyncs.length) {
        throw redirectToTab(IntegrationsListPageTabs.SecretSyncs);
      }

      let integrations: TIntegration[];
      try {
        integrations = await getIntegrations();
      } catch {
        throw redirectToTab(IntegrationsListPageTabs.AppConnections);
      }

      if (integrations.length) {
        throw redirectToTab(IntegrationsListPageTabs.NativeIntegrations);
      }

      // Default to App Connections tab if no existing syncs or integrations
      throw redirectToTab(IntegrationsListPageTabs.AppConnections);
    }

    // Native integrations are deprecated: only projects that already have one can access the tab
    if (search.selectedTab === IntegrationsListPageTabs.NativeIntegrations) {
      let integrations: TIntegration[] = [];

      try {
        integrations = await getIntegrations();
      } catch {
        // fall through to the redirect below
      }

      if (!integrations.length) {
        throw redirectToTab(IntegrationsListPageTabs.AppConnections);
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
