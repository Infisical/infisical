import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOCIVaultKeys, listOCIVaults } from "./oci-connection-fns";
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

export const ociConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listVaults = async ({ connectionId, compartmentOcid }: TListOCIVaultsDTO, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OCI, connectionId, actor);

    try {
      const vaults = await listOCIVaults(appConnection, compartmentOcid);
      return vaults;
    } catch (error) {
      return [];
    }
  };

  const listVaultKeys = async (
    { connectionId, compartmentOcid, vaultOcid }: TListOCIVaultKeysDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.OCI, connectionId, actor);

    try {
      const vaults = await listOCIVaultKeys(appConnection, compartmentOcid, vaultOcid);
      return vaults;
    } catch (error) {
      return [];
    }
  };

  return {
    listVaults,
    listVaultKeys
  };
};
