import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { createAdcsHttpClient, listAdcsTemplates } from "./azure-adcs-connection-fns";
import { TAzureADCSConnection } from "./azure-adcs-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAzureADCSConnection>;

export const azureAdcsConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listTemplates = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AzureADCS, connectionId, actor);
    const { credentials } = appConnection;
    const client = createAdcsHttpClient(
      credentials.username,
      credentials.password,
      credentials.adcsUrl,
      credentials.sslRejectUnauthorized ?? true,
      credentials.sslCertificate
    );
    return listAdcsTemplates(client);
  };

  return {
    listTemplates
  };
};
