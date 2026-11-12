import type { TCloud66Stack } from "@app/hooks/api/appConnections/cloud-66/types";
import type { TFlyioApp } from "@app/hooks/api/appConnections/flyio/types";
import type { THerokuApp } from "@app/hooks/api/appConnections/heroku/types";
import type {
  TLaravelForgeOrganization,
  TLaravelForgeServer,
  TLaravelForgeSite
} from "@app/hooks/api/appConnections/laravel-forge/types";
import type { TNetlifyAccount, TNetlifySite } from "@app/hooks/api/appConnections/netlify/types";
import type {
  TPortainerEnvironment,
  TPortainerStack
} from "@app/hooks/api/appConnections/portainer/types";
import type { TRailwayProject } from "@app/hooks/api/appConnections/railway/types";
import type {
  TRenderEnvironmentGroup,
  TRenderService
} from "@app/hooks/api/appConnections/render/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncHostingLookups = {
  useHerokuApps: ConnectionOptions<THerokuApp>;
  useNetlifyAccounts: ConnectionOptions<TNetlifyAccount>;
  useNetlifySites: (
    dto: { connectionId: string; accountId: string },
    options?: QueryOptions
  ) => V4QueryResult<TNetlifySite[]>;
  useRenderServices: ConnectionOptions<TRenderService>;
  useRenderEnvironmentGroups: ConnectionOptions<TRenderEnvironmentGroup>;
  useRailwayProjects: ConnectionOptions<TRailwayProject>;
  useFlyioApps: ConnectionOptions<TFlyioApp>;
  useCloud66Stacks: ConnectionOptions<TCloud66Stack>;
  useLaravelForgeOrganizations: ConnectionOptions<TLaravelForgeOrganization>;
  useLaravelForgeServers: (
    dto: { connectionId: string; organizationSlug: string },
    options?: QueryOptions
  ) => V4QueryResult<TLaravelForgeServer[]>;
  useLaravelForgeSites: (
    dto: { connectionId: string; organizationSlug: string; serverId: string },
    options?: QueryOptions
  ) => V4QueryResult<TLaravelForgeSite[]>;
  usePortainerEnvironments: ConnectionOptions<TPortainerEnvironment>;
  usePortainerStacks: ConnectionOptions<TPortainerStack>;
};
