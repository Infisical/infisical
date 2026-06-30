import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listCloud66Stacks } from "./cloud-66-connection-fns";
import { TCloud66Connection } from "./cloud-66-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCloud66Connection>;

export const cloud66ConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listStacks = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloud66, connectionId, actor);

    try {
      const stacks = await listCloud66Stacks(appConnection);
      return stacks;
    } catch (error) {
      logger.error(error, `Failed to list Cloud 66 stacks for connection ${connectionId}`);
      return [];
    }
  };

  return {
    listStacks
  };
};
