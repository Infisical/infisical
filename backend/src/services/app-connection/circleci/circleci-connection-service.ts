import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listCircleCIOrganizations } from "./circleci-connection-fns";
import { TCircleCIConnection } from "./circleci-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCircleCIConnection>;

export const circleciConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.CircleCI, connectionId, actor);
    const organizations = await listCircleCIOrganizations(appConnection);
    return organizations;
  };

  return {
    listOrganizations
  };
};
