import { TActorContext } from "@app/domains/lib/actor-context";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import {
  getGcpCertificateManagerLocations,
  getGcpCertificateManagerProjects,
  getGcpCertificateMaps,
  getGcpCloudDnsProjects,
  getGcpCloudDnsZones,
  getGcpSecretManagerProjectLocations,
  getGcpSecretManagerProjects
} from "./gcp-connection-fns";
import {
  TGcpCertificateManagerProjectScopedDTO,
  TGcpConnection,
  TGetGCPProjectLocationsDTO
} from "./gcp-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TGcpConnection>;

export const gcpConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  instanceConfigService: TInstanceConfigService
) => {
  const listSecretManagerProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const projects = await getGcpSecretManagerProjects(appConnection, instanceConfigService);

      return projects;
    } catch (error) {
      logger.error(error, "Error listing GCP secret manager projects");
      return [];
    }
  };

  const listSecretManagerProjectLocations = async (
    { connectionId, projectId }: TGetGCPProjectLocationsDTO,
    actor: TActorContext
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const locations = await getGcpSecretManagerProjectLocations(projectId, appConnection, instanceConfigService);

      return locations;
    } catch (error) {
      return [];
    }
  };

  const listCertificateManagerProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateManagerProjects(appConnection, instanceConfigService);
    } catch (error) {
      logger.error(error, "Error listing GCP Certificate Manager projects");
      throw error;
    }
  };

  const listCertificateManagerLocations = async (
    { connectionId, gcpProjectId }: TGcpCertificateManagerProjectScopedDTO,
    actor: TActorContext
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateManagerLocations(gcpProjectId, appConnection, instanceConfigService);
    } catch (error) {
      logger.error(error, "Error listing GCP Certificate Manager locations");
      throw error;
    }
  };

  const listCertificateMaps = async (
    { connectionId, gcpProjectId }: TGcpCertificateManagerProjectScopedDTO,
    actor: TActorContext
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateMaps(gcpProjectId, appConnection, instanceConfigService);
    } catch (error) {
      logger.error(error, "Error listing GCP certificate maps");
      throw error;
    }
  };

  const listCloudDnsProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCloudDnsProjects(appConnection, instanceConfigService);
    } catch (error) {
      logger.error(error, `Error listing GCP Cloud DNS projects [connectionId=${connectionId}]`);
      throw error;
    }
  };

  const listCloudDnsZones = async (
    { connectionId, gcpProjectId }: TGcpCertificateManagerProjectScopedDTO,
    actor: TActorContext
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCloudDnsZones(gcpProjectId, appConnection, instanceConfigService);
    } catch (error) {
      logger.error(
        error,
        `Error listing GCP Cloud DNS zones [connectionId=${connectionId}] [gcpProjectId=${gcpProjectId}]`
      );
      throw error;
    }
  };

  return {
    listCloudDnsProjects,
    listCloudDnsZones,
    listSecretManagerProjects,
    listSecretManagerProjectLocations,
    listCertificateManagerProjects,
    listCertificateManagerLocations,
    listCertificateMaps
  };
};
