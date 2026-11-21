import { useHumanitecConnectionListOrganizations } from "@app/hooks/api/appConnections/humanitec";
import {
  useNorthflankConnectionListProjects,
  useNorthflankConnectionListSecretGroups
} from "@app/hooks/api/appConnections/northflank";
import {
  useOctopusDeployConnectionGetScopeValues,
  useOctopusDeployConnectionListProjects,
  useOctopusDeployConnectionListSpaces
} from "@app/hooks/api/appConnections/octopus-deploy";
import {
  useQoveryConnectionListEnvironments,
  useQoveryConnectionListOrganizations,
  useQoveryConnectionListProjects
} from "@app/hooks/api/appConnections/qovery";
import { useSpaceliftConnectionListContexts } from "@app/hooks/api/appConnections/spacelift";
import { useTerraformCloudConnectionListOrganizations } from "@app/hooks/api/appConnections/terraform-cloud";

import type { SyncDeployLookups } from "./contract-sync-deploy";

export const syncDeployLive: SyncDeployLookups = {
  useTerraformCloudOrganizations: (connectionId, options) =>
    useTerraformCloudConnectionListOrganizations(connectionId, options),
  useOctopusDeploySpaces: (connectionId, options) =>
    useOctopusDeployConnectionListSpaces(connectionId, options),
  useOctopusDeployProjects: ({ connectionId, spaceId }, options) =>
    useOctopusDeployConnectionListProjects(connectionId, spaceId, options),
  useOctopusDeployScopeValues: ({ connectionId, spaceId, projectId }, options) =>
    useOctopusDeployConnectionGetScopeValues(connectionId, spaceId, projectId, options),
  useSpaceliftContexts: (connectionId, options) =>
    useSpaceliftConnectionListContexts(connectionId, options),
  useHumanitecOrganizations: (connectionId, options) =>
    useHumanitecConnectionListOrganizations(connectionId, options),
  useNorthflankProjects: (connectionId, options) =>
    useNorthflankConnectionListProjects(connectionId, options),
  useNorthflankSecretGroups: ({ connectionId, projectId }, options) =>
    useNorthflankConnectionListSecretGroups(connectionId, projectId, options),
  useQoveryOrganizations: (connectionId, options) =>
    useQoveryConnectionListOrganizations(connectionId, options),
  useQoveryProjects: ({ connectionId, organizationId }, options) =>
    useQoveryConnectionListProjects(connectionId, organizationId, options),
  useQoveryEnvironments: ({ connectionId, projectId }, options) =>
    useQoveryConnectionListEnvironments(connectionId, projectId, options)
};
