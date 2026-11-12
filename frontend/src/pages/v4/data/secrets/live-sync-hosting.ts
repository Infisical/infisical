import { useCloud66ConnectionListStacks } from "@app/hooks/api/appConnections/cloud-66";
import { useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
import { useHerokuConnectionListApps } from "@app/hooks/api/appConnections/heroku";
import {
  useLaravelForgeConnectionListOrganizations,
  useLaravelForgeConnectionListServers,
  useLaravelForgeConnectionListSites
} from "@app/hooks/api/appConnections/laravel-forge";
import {
  useNetlifyConnectionListAccounts,
  useNetlifyConnectionListSites
} from "@app/hooks/api/appConnections/netlify";
import {
  usePortainerConnectionListEnvironments,
  usePortainerConnectionListStacks
} from "@app/hooks/api/appConnections/portainer";
import { useRailwayConnectionListProjects } from "@app/hooks/api/appConnections/railway";
import {
  useRenderConnectionListEnvironmentGroups,
  useRenderConnectionListServices
} from "@app/hooks/api/appConnections/render";

import type { SyncHostingLookups } from "./contract-sync-hosting";

export const syncHostingLive: SyncHostingLookups = {
  useHerokuApps: (connectionId, options) => useHerokuConnectionListApps(connectionId, options),
  useNetlifyAccounts: (connectionId, options) =>
    useNetlifyConnectionListAccounts(connectionId, options),
  useNetlifySites: ({ connectionId, accountId }, options) =>
    useNetlifyConnectionListSites(connectionId, accountId, options),
  useRenderServices: (connectionId, options) =>
    useRenderConnectionListServices(connectionId, options),
  useRenderEnvironmentGroups: (connectionId, options) =>
    useRenderConnectionListEnvironmentGroups(connectionId, options),
  useRailwayProjects: (connectionId, options) =>
    useRailwayConnectionListProjects(connectionId, options),
  useFlyioApps: (connectionId, options) => useFlyioConnectionListApps(connectionId, options),
  useCloud66Stacks: (connectionId, options) =>
    useCloud66ConnectionListStacks(connectionId, options),
  useLaravelForgeOrganizations: (connectionId, options) =>
    useLaravelForgeConnectionListOrganizations(connectionId, options),
  useLaravelForgeServers: ({ connectionId, organizationSlug }, options) =>
    useLaravelForgeConnectionListServers(connectionId, organizationSlug, options),
  useLaravelForgeSites: ({ connectionId, organizationSlug, serverId }, options) =>
    useLaravelForgeConnectionListSites(connectionId, organizationSlug, serverId, options),
  usePortainerEnvironments: (connectionId, options) =>
    usePortainerConnectionListEnvironments(connectionId, options),
  usePortainerStacks: (connectionId, options) =>
    usePortainerConnectionListStacks(connectionId, options)
};
