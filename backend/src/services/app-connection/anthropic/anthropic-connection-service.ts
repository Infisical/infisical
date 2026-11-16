import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { getAnthropicErrorMessage, listAnthropicModels } from "./anthropic-connection-fns";
import { TAnthropicConnection } from "./anthropic-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAnthropicConnection>;

export const anthropicConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listModels = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Anthropic, connectionId, actor);
    try {
      return await listAnthropicModels(appConnection);
    } catch (error) {
      logger.warn(
        { message: getAnthropicErrorMessage(error) },
        `Failed to list Anthropic models [connectionId=${connectionId}]`
      );
      throw new BadRequestError({ message: `Couldn't list models: ${getAnthropicErrorMessage(error)}` });
    }
  };

  return {
    listModels
  };
};
