import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { createAdcsHttpClient, listAdcsTemplates } from "./azure-adcs-connection-fns";
import { TAzureADCSConnection } from "./azure-adcs-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TAzureADCSConnection>;

export const azureAdcsConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listTemplates = async (connectionId: string, actor: TActorContext) => {
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
