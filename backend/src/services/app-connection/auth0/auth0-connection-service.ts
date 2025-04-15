import { request } from "@app/lib/config/request";
import { OrgServiceActor } from "@app/lib/types";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getAuth0ConnectionAccessToken } from "@app/services/app-connection/auth0/auth0-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAuth0Connection, TAuth0ListClient, TAuth0ListClientsResponse } from "./auth0-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAuth0Connection>;

const listAuth0Clients = async (
  appConnection: TAuth0Connection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const accessToken = await getAuth0ConnectionAccessToken(appConnection, appConnectionDAL, kmsService);

  const { audience, clientId: connectionClientId } = appConnection.credentials;
  await blockLocalAndPrivateIpAddresses(audience);

  const clients: TAuth0ListClient[] = [];
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop
    const { data: clientsPage } = await request.get<TAuth0ListClientsResponse>(`${audience}clients`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      },
      params: {
        include_totals: true,
        per_page: 100,
        page
      }
    });

    clients.push(...clientsPage.clients);
    page += 1;
    hasMore = clientsPage.total > clients.length;
  }

  return (
    clients.filter((client) => client.client_id !== connectionClientId && client.name !== "All Applications") ?? []
  );
};

export const auth0ConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listClients = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Auth0, connectionId, actor);

    const clients = await listAuth0Clients(appConnection, appConnectionDAL, kmsService);

    return clients.map((client) => ({ id: client.client_id, name: client.name }));
  };

  return {
    listClients
  };
};
