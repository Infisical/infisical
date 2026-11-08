import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { request } from "@app/lib/config/request";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-client-secrets/azure-client-secrets-connection-fns";

import {
  TAzureClientSecretsConnection,
  TAzureListRegisteredAppsResponse,
  TAzureRegisteredApp
} from "./azure-client-secrets-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAzureClientSecretsConnection>;

const listAzureRegisteredApps = async (
  appConnection: TAzureClientSecretsConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsCoreDomain: TKmsCoreDomain
) => {
  const accessToken = await getAzureConnectionAccessToken(appConnection.id, appConnectionDAL, kmsCoreDomain);

  const graphEndpoint = `https://graph.microsoft.com/v1.0/applications`;

  const apps: TAzureRegisteredApp[] = [];
  let nextLink = graphEndpoint;

  while (nextLink) {
    // eslint-disable-next-line no-await-in-loop
    const { data: appsPage } = await request.get<TAzureListRegisteredAppsResponse>(nextLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    apps.push(...appsPage.value);
    nextLink = appsPage["@odata.nextLink"] || "";
  }

  return apps;
};

export const azureClientSecretsConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsCoreDomain: TKmsCoreDomain
) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AzureClientSecrets, connectionId, actor);

    const apps = await listAzureRegisteredApps(appConnection, appConnectionDAL, kmsCoreDomain);

    return apps.map((app) => ({
      id: app.id,
      name: app.displayName,
      appId: app.appId
    }));
  };

  return {
    listApps
  };
};
