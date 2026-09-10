import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TLdapConnection, TLdapConnectionConfig } from "./ldap-connection-types";
import { DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT, listDirectoryMachines, TDirectoryMachine } from "./ldap-directory-fns";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TLdapConnection>;

export const ldapConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">
) => {
  const listMachines = async (
    connectionId: string,
    { search, limit }: { search?: string; limit?: number },
    actor: OrgServiceActor
  ): Promise<TDirectoryMachine[]> => {
    const appConnection = await getAppConnection(AppConnection.LDAP, connectionId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.LdapDirectoryMachines(
        connectionId,
        search?.toLowerCase() ?? "",
        limit ?? DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT
      ),
      ttlSeconds: KeyStoreTtls.LdapDirectoryMachinesInSeconds,
      fetcher: () =>
        listDirectoryMachines(
          { config: appConnection as unknown as TLdapConnectionConfig, search, limit },
          { gatewayV2Service, gatewayPoolService, keyStore }
        )
    });
  };

  return {
    listMachines
  };
};
