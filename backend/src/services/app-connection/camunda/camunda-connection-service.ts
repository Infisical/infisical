import { request } from "@app/lib/config/request";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getCamundaConnectionAccessToken } from "./camunda-connection-fns";
import { TCamundaConnection, TCamundaListClustersResponse } from "./camunda-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCamundaConnection>;

const listCamundaClusters = async (
  appConnection: TCamundaConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const accessToken = await getCamundaConnectionAccessToken(appConnection, appConnectionDAL, kmsService);

  const { data } = await request.get<TCamundaListClustersResponse>(`${IntegrationUrls.CAMUNDA_API_URL}/clusters`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Encoding": "application/json"
    }
  });

  return data ?? [];
};

export const camundaConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listClusters = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Camunda, connectionId, actor);

    const clusters = await listCamundaClusters(appConnection, appConnectionDAL, kmsService);

    return clusters;
  };

  return {
    listClusters
  };
};
