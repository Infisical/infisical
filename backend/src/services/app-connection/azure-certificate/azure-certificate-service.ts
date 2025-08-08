import { request } from "@app/lib/config/request";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-certificate/azure-certificate-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import {
  TAzureCertificateConnection,
  TAzureListRegisteredAppsResponse,
  TAzureRegisteredApp
} from "./azure-certificate-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAzureCertificateConnection>;

const listAzureRegisteredApps = async (
  appConnection: TAzureCertificateConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const accessToken = await getAzureConnectionAccessToken(appConnection.id, appConnectionDAL, kmsService);

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

export const azureCertificateConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listServices = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AzureCertificate, connectionId, actor);

    const apps = await listAzureRegisteredApps(appConnection, appConnectionDAL, kmsService);

    return apps.map((app) => ({
      id: app.id,
      name: app.displayName,
      appId: app.appId
    }));
  };

  return {
    listServices
  };
};
