import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  getDigiCertOrgCodeSigningValidation,
  listDigiCertCodeSigningOrders,
  listDigiCertOrganizations,
  listDigiCertProducts
} from "./digicert-connection-fns";
import { TDigiCertConnection } from "./digicert-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDigiCertConnection>;

export const digicertConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await listDigiCertOrganizations(appConnection);
    } catch (error) {
      logger.error(error, `Failed to list DigiCert organizations [connectionId=${connectionId}]`);
      return [];
    }
  };

  const listProducts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await listDigiCertProducts(appConnection);
    } catch (error) {
      logger.error(error, `Failed to list DigiCert products [connectionId=${connectionId}]`);
      return [];
    }
  };

  const getCodeSigningValidation = async (
    connectionId: string,
    organizationId: number,
    productNameId: string,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await getDigiCertOrgCodeSigningValidation(appConnection, organizationId, productNameId);
    } catch (error) {
      logger.error(error, `Failed to check DigiCert code signing validation [connectionId=${connectionId}]`);
      return { isValidated: false };
    }
  };

  const listCodeSigningOrders = async (
    connectionId: string,
    organizationId: number,
    productNameId: string,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await listDigiCertCodeSigningOrders(appConnection, organizationId, productNameId);
    } catch (error) {
      logger.error(error, `Failed to list DigiCert code signing orders [connectionId=${connectionId}]`);
      return [];
    }
  };

  return {
    listOrganizations,
    listProducts,
    getCodeSigningValidation,
    listCodeSigningOrders
  };
};
