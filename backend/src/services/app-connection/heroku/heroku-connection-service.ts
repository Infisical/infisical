import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { listHerokuApps as getHerokuApps } from "./heroku-connection-fns";
import { THerokuConnection } from "./heroku-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<THerokuConnection>;

export const herokuConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Heroku, connectionId, actor);
    try {
      const apps = await getHerokuApps({ appConnection, appConnectionDAL, kmsService });
      return apps;
    } catch (error) {
      logger.error(error, `Failed to establish connection with Heroku for app ${connectionId}`);
      return [];
    }
  };

  return {
    listApps
  };
};
