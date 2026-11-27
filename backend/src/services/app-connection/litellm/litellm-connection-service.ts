import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listLiteLLMModels, listLiteLLMTeams, listLiteLLMUsers } from "./litellm-connection-fns";
import { TLiteLLMConnection } from "./litellm-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TLiteLLMConnection>;

export const liteLLMConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listUsers = async (connectionId: string, actor: TActorContext, search?: string) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMUsers(appConnection, search);
  };

  const listTeams = async (connectionId: string, actor: TActorContext, search?: string) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMTeams(appConnection, search);
  };

  const listModels = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.LiteLLM, connectionId, actor);
    return listLiteLLMModels(appConnection);
  };

  return {
    listUsers,
    listTeams,
    listModels
  };
};
