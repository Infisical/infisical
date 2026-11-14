import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { request } from "@app/lib/config/request";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

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
  kmsDataKeyService: TKmsDataKeyService
) => {
  const accessToken = await getCamundaConnectionAccessToken(appConnection, appConnectionDAL, kmsDataKeyService);

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
  kmsDataKeyService: TKmsDataKeyService
) => {
  const listClusters = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Camunda, connectionId, actor);

    const clusters = await listCamundaClusters(appConnection, appConnectionDAL, kmsDataKeyService);

    return clusters;
  };

  return {
    listClusters
  };
};
