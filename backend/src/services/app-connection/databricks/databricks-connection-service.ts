import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  databricksRequest,
  getDatabricksConnectionAccessToken
} from "@app/services/app-connection/databricks/databricks-connection-fns";
import {
  TDatabricksConnection,
  TDatabricksGatewayDeps,
  TDatabricksListSecretScopesResponse,
  TDatabricksListServicePrincipalsResponse
} from "@app/services/app-connection/databricks/databricks-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDatabricksConnection>;

const listDatabricksSecretScopes = async (
  appConnection: TDatabricksConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  deps: TDatabricksGatewayDeps
) => {
  const accessToken = await getDatabricksConnectionAccessToken(appConnection, appConnectionDAL, kmsService, deps);

  const data = await databricksRequest<TDatabricksListSecretScopesResponse>(
    appConnection,
    {
      method: "GET",
      path: "/api/2.0/secrets/scopes/list",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    },
    deps
  );

  // not present in response if no scopes exists
  return data.scopes ?? [];
};

const listDatabricksServicePrincipals = async (
  appConnection: TDatabricksConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const {
    credentials: { workspaceUrl }
  } = appConnection;

  const accessToken = await getDatabricksConnectionAccessToken(appConnection, appConnectionDAL, kmsService);

  const allServicePrincipals: Array<{ id: string; name: string; clientId: string }> = [];
  let startIndex = 1;
  const itemsPerPage = 100;
  const maxPages = 20;
  let currentPage = 0;

  while (currentPage < maxPages) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<TDatabricksListServicePrincipalsResponse>(
      `${removeTrailingSlash(workspaceUrl)}/api/2.0/preview/scim/v2/ServicePrincipals`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        params: {
          startIndex,
          count: itemsPerPage
        }
      }
    );

    const resources = data.Resources ?? [];
    allServicePrincipals.push(
      ...resources.map((sp) => ({
        id: sp.id,
        name: sp.displayName,
        clientId: sp.applicationId || ""
      }))
    );

    currentPage += 1;

    const totalResults = data.totalResults ?? resources.length;
    if (allServicePrincipals.length >= totalResults || resources.length < itemsPerPage) {
      break;
    }

    startIndex += itemsPerPage;
  }

  return allServicePrincipals;
};

export const databricksConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listSecretScopes = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Databricks, connectionId, actor);

    const secretScopes = await listDatabricksSecretScopes(appConnection, appConnectionDAL, kmsService, {
      gatewayV2Service,
      gatewayPoolService
    });

    return secretScopes;
  };

  const listServicePrincipals = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Databricks, connectionId, actor);

    const servicePrincipals = await listDatabricksServicePrincipals(appConnection, appConnectionDAL, kmsService);

    return servicePrincipals;
  };

  return {
    listSecretScopes,
    listServicePrincipals
  };
};
