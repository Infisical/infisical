import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listOpenAIProjects } from "./openai-connection-fns";
import { TOpenAIConnection } from "./openai-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TOpenAIConnection>;

export const openaiConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.OpenAI, connectionId, actor);
    return listOpenAIProjects(appConnection);
  };

  return {
    listProjects
  };
};
