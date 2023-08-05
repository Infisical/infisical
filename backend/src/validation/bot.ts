import { Types } from "mongoose";
import {
    Bot,
    IUser,
} from "../models";
import { validateUserClientForWorkspace } from "./user";
import {
    BotNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

/**
 * Validate authenticated clients for bot with id [botId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.botId - id of bot to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 */
export const validateClientForBot = async ({
  authData,
  botId,
  acceptedRoles,
}: {
  authData: AuthData;
  botId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const bot = await Bot.findById(botId);
  if (!bot) throw BotNotFoundError();
  
  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId: bot.workspace,
        acceptedRoles,
      });
      return bot;
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for bot",
      });
  }
};