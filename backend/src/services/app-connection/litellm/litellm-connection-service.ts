import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listLiteLLMModels, listLiteLLMTeams, listLiteLLMUsers } from "./litellm-connection-fns";
import { TLiteLLMConnection } from "./litellm-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TLiteLLMConnection>;

export const liteLLMConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listUsers = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMUsers(appConnection);
  };

  const listTeams = async (connectionId: string, actor: OrgServiceActor, userId?: string) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMTeams(appConnection, userId);
  };

  const listModels = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMModels(appConnection);
  };

  return {
    listUsers,
    listTeams,
    listModels
  };
};
