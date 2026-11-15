import { useQuery } from "@tanstack/react-query";

import { OrgMembershipRole } from "@app/helpers/roles";
import {
  useCreateAppConnection,
  useDeleteAppConnection,
  useRotateAppConnectionCredentials,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections/mutations";
import {
  useAppConnectionOptions,
  useListAppConnections
} from "@app/hooks/api/appConnections/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { useListGitHubApps } from "@app/hooks/api/gitHubApps/queries";
import { useImportEnvKey, useImportVault } from "@app/hooks/api/migration/mutations";
import { useHasCustomMigrationAvailable } from "@app/hooks/api/migration/queries";
import { useGetUserOrgPermissions } from "@app/hooks/api/roles/queries";
import {
  useCheckMicrosoftTeamsIntegrationInstallationStatus,
  useCreateMicrosoftTeamsIntegration,
  useDeleteMicrosoftTeamsIntegration,
  useDeleteSlackIntegration,
  useUpdateMicrosoftTeamsIntegration,
  useUpdateSlackIntegration
} from "@app/hooks/api/workflowIntegrations/mutation";
import {
  fetchSlackInstallUrl,
  fetchSlackReinstallUrl,
  useGetMicrosoftTeamsClientId,
  useGetMicrosoftTeamsIntegrationById,
  useGetSlackIntegrationById,
  useGetWorkflowIntegrations
} from "@app/hooks/api/workflowIntegrations/queries";

import type { IntegrationsAdapter } from "./contract";

export const integrationsLive: IntegrationsAdapter = {
  useConnections: useListAppConnections,
  useConnectionOptions: useAppConnectionOptions,
  useCreateConnection: useCreateAppConnection,
  useUpdateConnection: useUpdateAppConnection,
  useRotateCredentials: useRotateAppConnectionCredentials,
  useDeleteConnection: useDeleteAppConnection,
  useGitHubApps: useListGitHubApps,
  useWorkflowIntegrations: useGetWorkflowIntegrations,
  useSlackIntegration: useGetSlackIntegrationById,
  useMicrosoftTeamsIntegration: useGetMicrosoftTeamsIntegrationById,
  useMicrosoftTeamsClientId: useGetMicrosoftTeamsClientId,
  fetchSlackInstallUrl,
  fetchSlackReinstallUrl,
  useUpdateSlackIntegration,
  useUpdateMicrosoftTeamsIntegration,
  useCreateMicrosoftTeamsIntegration,
  useDeleteSlackIntegration,
  useDeleteMicrosoftTeamsIntegration,
  useCheckMicrosoftTeamsInstallation: useCheckMicrosoftTeamsIntegrationInstallationStatus,
  useIsOrgAdmin: (orgId) => {
    const query = useGetUserOrgPermissions({ orgId });
    return {
      ...query,
      data: query.data?.memberships.some((membership) =>
        membership.roles.some(({ role }) => role === OrgMembershipRole.Admin)
      )
    };
  },
  useMigrationGateways: () => useQuery(gatewaysQueryKeys.list()),
  useCustomMigrationAvailable: useHasCustomMigrationAvailable,
  useImportEnvKey,
  useImportVault
};
