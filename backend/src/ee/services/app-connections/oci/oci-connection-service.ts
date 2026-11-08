import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../../../../services/app-connection/app-connection-enums";
import { listOCICompartments, listOCIVaultKeys, listOCIVaults } from "./oci-connection-fns";
import { TOCIConnection } from "./oci-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOCIConnection>;

type TListOCIVaultsDTO = {
  connectionId: string;
  compartmentOcid: string;
};

type TListOCIVaultKeysDTO = {
  connectionId: string;
  compartmentOcid: string;
  vaultOcid: string;
};

// Enterprise check
export const checkPlan = async (license: TLicenseDomain, orgId: string) => {
  const plan = await license.getPlan(orgId);
  if (!plan.enterpriseAppConnections)
    throw new BadRequestError({
      message:
        "Failed to use app connection due to plan restriction. Upgrade plan to access enterprise app connections."
    });
};

export const ociConnectionService = (getAppConnection: TGetAppConnectionFunc, license: TLicenseDomain) => {
  const listCompartments = async (connectionId: string, actor: OrgServiceActor) => {
    await checkPlan(license, actor.orgId);

    const appConnection = await getAppConnection(AppConnection.OCI, connectionId, actor);

    try {
      const compartments = await listOCICompartments(appConnection);
      return compartments;
    } catch (error) {
      logger.error(error, "Failed to establish connection with OCI");
      return [];
    }
  };

  const listVaults = async ({ connectionId, compartmentOcid }: TListOCIVaultsDTO, actor: OrgServiceActor) => {
    await checkPlan(license, actor.orgId);

    const appConnection = await getAppConnection(AppConnection.OCI, connectionId, actor);

    try {
      const vaults = await listOCIVaults(appConnection, compartmentOcid);
      return vaults;
    } catch (error) {
      logger.error(error, "Failed to establish connection with OCI");
      return [];
    }
  };

  const listVaultKeys = async (
    { connectionId, compartmentOcid, vaultOcid }: TListOCIVaultKeysDTO,
    actor: OrgServiceActor
  ) => {
    await checkPlan(license, actor.orgId);

    const appConnection = await getAppConnection(AppConnection.OCI, connectionId, actor);

    try {
      const keys = await listOCIVaultKeys(appConnection, compartmentOcid, vaultOcid);
      return keys;
    } catch (error) {
      logger.error(error, "Failed to establish connection with OCI");
      return [];
    }
  };

  return {
    listCompartments,
    listVaults,
    listVaultKeys
  };
};
