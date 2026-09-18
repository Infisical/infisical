import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOpenAIProjects } from "./openai-connection-fns";
import { TOpenAIConnection } from "./openai-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOpenAIConnection>;

export const openaiConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OpenAI, connectionId, actor);
    return listOpenAIProjects(appConnection);
  };

  return {
    listProjects
  };
};
