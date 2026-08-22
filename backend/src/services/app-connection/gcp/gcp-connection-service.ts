import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  getGcpCertificateManagerLocations,
  getGcpCertificateManagerProjects,
  getGcpCertificateMaps,
  getGcpSecretManagerProjectLocations,
  getGcpSecretManagerProjects
} from "./gcp-connection-fns";
import {
  TGcpConnection,
  TGetGcpCertificateManagerLocationsDTO,
  TGetGcpCertificateMapsDTO,
  TGetGCPProjectLocationsDTO
} from "./gcp-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGcpConnection>;

export const gcpConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listSecretManagerProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const projects = await getGcpSecretManagerProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(error, "Error listing GCP secret manager projects");
      return [];
    }
  };

  const listSecretManagerProjectLocations = async (
    { connectionId, projectId }: TGetGCPProjectLocationsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const locations = await getGcpSecretManagerProjectLocations(projectId, appConnection);

      return locations;
    } catch (error) {
      return [];
    }
  };

  const listCertificateManagerProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateManagerProjects(appConnection);
    } catch (error) {
      logger.error(error, "Error listing GCP Certificate Manager projects");
      throw error;
    }
  };

  const listCertificateManagerLocations = async (
    { connectionId, gcpProjectId }: TGetGcpCertificateManagerLocationsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateManagerLocations(gcpProjectId, appConnection);
    } catch (error) {
      logger.error(error, "Error listing GCP Certificate Manager locations");
      throw error;
    }
  };

  const listCertificateMaps = async (
    { connectionId, gcpProjectId }: TGetGcpCertificateMapsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      return await getGcpCertificateMaps(gcpProjectId, appConnection);
    } catch (error) {
      logger.error(error, "Error listing GCP certificate maps");
      throw error;
    }
  };

  return {
    listSecretManagerProjects,
    listSecretManagerProjectLocations,
    listCertificateManagerProjects,
    listCertificateManagerLocations,
    listCertificateMaps
  };
};
