import { Types } from 'mongoose';
import {
    IUser,
    IServiceAccount,
    IServiceTokenData,
    Bot,
    User,
    ServiceAccount,
    ServiceTokenData
} from '../models';
import { validateServiceAccountClientForWorkspace } from './serviceAccount';
import { validateUserClientForWorkspace } from './user';
import {
    UnauthorizedRequestError,
    BotNotFoundError
} from '../utils/errors';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY
} from '../variables';

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
  authData: {
    authMode: string;
    authPayload: IUser | IServiceAccount | IServiceTokenData;
  };
  botId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const bot = await Bot.findById(botId);

  if (!bot) throw BotNotFoundError();

  if (
    authData.authMode === AUTH_MODE_JWT &&
    authData.authPayload instanceof User
  ) {
    await validateUserClientForWorkspace({
      user: authData.authPayload,
      workspaceId: bot.workspace,
      acceptedRoles,
    });

    return bot;
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_ACCOUNT &&
    authData.authPayload instanceof ServiceAccount
  ) {
    await validateServiceAccountClientForWorkspace({
      serviceAccount: authData.authPayload,
      workspaceId: bot.workspace,
    });

    return bot;
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_TOKEN &&
    authData.authPayload instanceof ServiceTokenData
  ) {
    throw UnauthorizedRequestError({
      message: "Failed service token authorization for bot",
    });
  }

  if (
    authData.authMode === AUTH_MODE_API_KEY &&
    authData.authPayload instanceof User
  ) {
    await validateUserClientForWorkspace({
      user: authData.authPayload,
      workspaceId: bot.workspace,
      acceptedRoles,
    });

    return bot;
  }

  throw BotNotFoundError({
    message: "Failed client authorization for bot",
  });
};