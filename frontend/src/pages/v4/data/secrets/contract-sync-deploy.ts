import type { THumanitecOrganization } from "@app/hooks/api/appConnections/humanitec/types";
import type {
  TNorthflankProject,
  TNorthflankSecretGroup
} from "@app/hooks/api/appConnections/northflank/types";
import type {
  TOctopusDeployProject,
  TOctopusDeployScopeValues,
  TOctopusDeploySpace
} from "@app/hooks/api/appConnections/octopus-deploy/types";
import type {
  TQoveryConnectionEnvironment,
  TQoveryConnectionOrganization,
  TQoveryConnectionProject
} from "@app/hooks/api/appConnections/qovery/types";
import type { TSpaceliftContext } from "@app/hooks/api/appConnections/spacelift/types";
import type { TTerraformCloudOrganization } from "@app/hooks/api/appConnections/terraform-cloud/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncDeployLookups = {
  useTerraformCloudOrganizations: ConnectionOptions<TTerraformCloudOrganization>;
  useOctopusDeploySpaces: ConnectionOptions<TOctopusDeploySpace>;
  useOctopusDeployProjects: (
    dto: { connectionId: string; spaceId: string },
    options?: QueryOptions
  ) => V4QueryResult<TOctopusDeployProject[]>;
  useOctopusDeployScopeValues: (
    dto: { connectionId: string; spaceId: string; projectId: string },
    options?: QueryOptions
  ) => V4QueryResult<TOctopusDeployScopeValues>;
  useSpaceliftContexts: ConnectionOptions<TSpaceliftContext>;
  useHumanitecOrganizations: ConnectionOptions<THumanitecOrganization>;
  useNorthflankProjects: ConnectionOptions<TNorthflankProject>;
  useNorthflankSecretGroups: (
    dto: { connectionId: string; projectId: string },
    options?: QueryOptions
  ) => V4QueryResult<TNorthflankSecretGroup[]>;
  useQoveryOrganizations: ConnectionOptions<TQoveryConnectionOrganization>;
  useQoveryProjects: (
    dto: { connectionId: string; organizationId: string },
    options?: QueryOptions
  ) => V4QueryResult<TQoveryConnectionProject[]>;
  useQoveryEnvironments: (
    dto: { connectionId: string; projectId: string },
    options?: QueryOptions
  ) => V4QueryResult<TQoveryConnectionEnvironment[]>;
};
