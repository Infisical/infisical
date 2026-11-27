import { TActorContext } from "@app/domains/lib/actor-context";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-client-secrets/azure-client-secrets-connection-fns";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";

import {
  TAzureClientSecretsConnection,
  TAzureListRegisteredAppsResponse,
  TAzureRegisteredApp
} from "./azure-client-secrets-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TAzureClientSecretsConnection>;

const listAzureRegisteredApps = async (
  appConnection: TAzureClientSecretsConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsDataKeyService: TKmsDataKeyService,
  instanceConfigService: TInstanceConfigService,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  const accessToken = await getAzureConnectionAccessToken(
    appConnection.id,
    appConnectionDAL,
    kmsDataKeyService,
    instanceConfigService,
    oidcIssuerService
  );

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
  kmsDataKeyService: TKmsDataKeyService,
  instanceConfigService: TInstanceConfigService,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  const listApps = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.AzureClientSecrets, connectionId, actor);

    const apps = await listAzureRegisteredApps(
      appConnection,
      appConnectionDAL,
      kmsDataKeyService,
      instanceConfigService,
      oidcIssuerService
    );

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
