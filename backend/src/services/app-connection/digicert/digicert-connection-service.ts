import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  DIGICERT_CS_PRODUCT_NAME_IDS,
  getDigiCertOrgValidation,
  listDigiCertOrders,
  listDigiCertOrganizations,
  listDigiCertProducts
} from "./digicert-connection-fns";
import { TDigiCertConnection } from "./digicert-connection-types";

const assertCodeSigningProduct = (productNameId: string) => {
  if (!DIGICERT_CS_PRODUCT_NAME_IDS.has(productNameId)) {
    throw new BadRequestError({
      message: `DigiCert product '${productNameId}' is not a code signing product.`
    });
  }
};

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

  const getOrgValidation = async (
    connectionId: string,
    organizationId: number,
    productNameId: string,
    actor: OrgServiceActor
  ) => {
    assertCodeSigningProduct(productNameId);
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await getDigiCertOrgValidation(appConnection, organizationId, productNameId);
    } catch (error) {
      logger.error(error, `Failed to check DigiCert organization validation [connectionId=${connectionId}]`);
      return { isValidated: false };
    }
  };

  const listOrders = async (
    connectionId: string,
    organizationId: number,
    productNameId: string,
    actor: OrgServiceActor
  ) => {
    assertCodeSigningProduct(productNameId);
    const appConnection = await getAppConnection(AppConnection.DigiCert, connectionId, actor);
    try {
      return await listDigiCertOrders(appConnection, organizationId, productNameId);
    } catch (error) {
      logger.error(error, `Failed to list DigiCert orders [connectionId=${connectionId}]`);
      return [];
    }
  };

  return {
    listOrganizations,
    listProducts,
    getOrgValidation,
    listOrders
  };
};
