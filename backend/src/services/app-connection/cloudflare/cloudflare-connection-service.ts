import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  getCloudflareErrorMessage,
  listCloudflarePagesProjects,
  listCloudflarePermissionGroups,
  listCloudflareR2Buckets,
  listCloudflareSecretsStores,
  listCloudflareWorkersPreviews,
  listCloudflareWorkersScripts,
  listCloudflareZones
} from "./cloudflare-connection-fns";
import { TCloudflareConnection } from "./cloudflare-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCloudflareConnection>;

export const cloudflareConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listPagesProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const projects = await listCloudflarePagesProjects(appConnection);
      return projects;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Pages projects for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  const listWorkersScripts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const scripts = await listCloudflareWorkersScripts(appConnection);
      return scripts;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Workers scripts for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  const listWorkersPreviews = async (connectionId: string, scriptId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const previews = await listCloudflareWorkersPreviews(appConnection, scriptId);
      return previews;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Workers Previews for Cloudflare connection [connectionId=${connectionId}] [scriptId=${scriptId}]`
      );
      return [];
    }
  };

  const listSecretsStores = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const stores = await listCloudflareSecretsStores(appConnection);
      return stores;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Secrets Stores for Cloudflare connection [connectionId=${connectionId}]`
      );
      throw new BadRequestError({
        message: `Failed to list Cloudflare Secrets Stores: ${getCloudflareErrorMessage(error)}`
      });
    }
  };

  const listZones = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const zones = await listCloudflareZones(appConnection);
      return zones;
    } catch (error) {
      logger.error(error, `Failed to list Cloudflare Zones for Cloudflare connection [connectionId=${connectionId}]`);
      return [];
    }
  };

  const listPermissionGroups = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const permissionGroups = await listCloudflarePermissionGroups(appConnection);
      return permissionGroups;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare permission groups for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  const listR2Buckets = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const buckets = await listCloudflareR2Buckets(appConnection);
      return buckets;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare R2 buckets for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  return {
    listPagesProjects,
    listWorkersScripts,
    listWorkersPreviews,
    listSecretsStores,
    listZones,
    listPermissionGroups,
    listR2Buckets
  };
};
