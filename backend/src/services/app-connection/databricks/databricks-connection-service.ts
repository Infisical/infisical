import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getDatabricksConnectionAccessToken } from "@app/services/app-connection/databricks/databricks-connection-fns";
import {
  TDatabricksConnection,
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
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const {
    credentials: { workspaceUrl }
  } = appConnection;

  const accessToken = await getDatabricksConnectionAccessToken(appConnection, appConnectionDAL, kmsService);

  const { data } = await request.get<TDatabricksListSecretScopesResponse>(
    `${removeTrailingSlash(workspaceUrl)}/api/2.0/secrets/scopes/list`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
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
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listSecretScopes = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Databricks, connectionId, actor);

    const secretScopes = await listDatabricksSecretScopes(appConnection, appConnectionDAL, kmsService);

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
