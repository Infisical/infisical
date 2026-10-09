import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  describePanOsError,
  isPanorama,
  listPanoramaTemplates,
  listSslTlsServiceProfiles,
  TPanOsClient,
  withPanOsClient
} from "./palo-alto-networks-connection-fns";
import { TPaloAltoNetworksConnection } from "./palo-alto-networks-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TPaloAltoNetworksConnection>;

export const paloAltoNetworksConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const withClient = async <T>(
    connectionId: string,
    actor: OrgServiceActor,
    resourceLabel: string,
    operation: (client: TPanOsClient) => Promise<T>
  ): Promise<T> => {
    const appConnection = await getAppConnection(AppConnection.PaloAltoNetworks, connectionId, actor);
    try {
      return await withPanOsClient(appConnection, { gatewayV2Service, gatewayPoolService }, operation);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to list ${resourceLabel} for Palo Alto Networks connection '${appConnection.name}': ${describePanOsError(error)}`
      });
    }
  };

  const listTemplates = async ({ connectionId }: { connectionId: string }, actor: OrgServiceActor) =>
    withClient(connectionId, actor, "templates", async (client) => {
      if (!(await isPanorama(client))) return { isPanorama: false, templates: [] };
      return { isPanorama: true, templates: await listPanoramaTemplates(client) };
    });

  const listProfiles = async (
    { connectionId, template }: { connectionId: string; template?: string },
    actor: OrgServiceActor
  ) =>
    withClient(connectionId, actor, "SSL/TLS service profiles", (client) =>
      listSslTlsServiceProfiles(client, template)
    );

  return { listTemplates, listSslTlsServiceProfiles: listProfiles };
};
