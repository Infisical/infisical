import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  listLaravelForgeOrganizations,
  listLaravelForgeServers,
  listLaravelForgeSites
} from "./laravel-forge-connection-fns";
import {
  TLaravelForgeConnection,
  TLaravelForgeOrganization,
  TLaravelForgeServer,
  TLaravelForgeSite
} from "./laravel-forge-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TLaravelForgeConnection>;

export const laravelForgeConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (
    connectionId: string,
    actor: OrgServiceActor
  ): Promise<TLaravelForgeOrganization[]> => {
    const appConnection = await getAppConnection(AppConnection.LaravelForge, connectionId, actor);
    try {
      const organizations = await listLaravelForgeOrganizations(appConnection);
      return organizations;
    } catch (error) {
      logger.error(error, "Failed to list organizations for Laravel Forge connection");
      return [];
    }
  };

  const listServers = async (
    connectionId: string,
    actor: OrgServiceActor,
    organizationSlug: string
  ): Promise<TLaravelForgeServer[]> => {
    const appConnection = await getAppConnection(AppConnection.LaravelForge, connectionId, actor);
    try {
      const servers = await listLaravelForgeServers(appConnection, organizationSlug);
      return servers;
    } catch (error) {
      logger.error(error, "Failed to list servers for Laravel Forge connection");
      return [];
    }
  };

  const listSites = async (
    connectionId: string,
    actor: OrgServiceActor,
    organizationSlug: string,
    serverId: number
  ): Promise<TLaravelForgeSite[]> => {
    const appConnection = await getAppConnection(AppConnection.LaravelForge, connectionId, actor);
    try {
      const sites = await listLaravelForgeSites(appConnection, organizationSlug, serverId);
      return sites;
    } catch (error) {
      logger.error(error, "Failed to list sites for Laravel Forge connection");
      return [];
    }
  };

  return {
    listOrganizations,
    listServers,
    listSites
  };
};
