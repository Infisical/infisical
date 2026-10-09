import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { KeeperCommandError, listKeeperSharedFolders } from "./keeper-connection-fns";
import { TKeeperConnection } from "./keeper-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TKeeperConnection>;

export const keeperConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listSharedFolders = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Keeper, connectionId, actor);

    try {
      const sharedFolders = await listKeeperSharedFolders(appConnection);
      return sharedFolders;
    } catch (error) {
      if (error instanceof KeeperCommandError) {
        throw new BadRequestError({ message: `Unable to list Keeper shared folders: ${error.message}` });
      }

      throw error;
    }
  };

  return {
    listSharedFolders
  };
};
