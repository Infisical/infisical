import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listVenafiApplications, listVenafiIssuingTemplates } from "./venafi-connection-fns";
import { TVenafiConnection } from "./venafi-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TVenafiConnection>;

export const venafiConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApplications = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Venafi, connectionId, actor);
    return listVenafiApplications(appConnection);
  };

  const listIssuingTemplates = async (connectionId: string, applicationId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Venafi, connectionId, actor);
    return listVenafiIssuingTemplates(appConnection, applicationId);
  };

  return {
    listApplications,
    listIssuingTemplates
  };
};
