import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOrganizations as getHumanitecOrganizations } from "./humanitec-connection-fns";
import { THumanitecConnection } from "./humanitec-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<THumanitecConnection>;

export const humanitecConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Humanitec, connectionId, actor);
    try {
      const organizations = await getHumanitecOrganizations(appConnection);
      return organizations;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Humanitec");
      return [];
    }
  };

  return {
    listOrganizations
  };
};
