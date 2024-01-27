import { Request, Response } from "express";
import { Types } from "mongoose";
import { Bot, BotKey } from "../../models";
import { createBot } from "../../helpers/bot";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/bot";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { BadRequestError } from "../../utils/errors";

interface BotKey {
  encryptedKey: string;
  nonce: string;
}

/**
 * Return bot for workspace with id [workspaceId]. If a workspace bot doesn't exist,
 * then create and return a new bot.
 * @param req
 * @param res
 * @returns
 */
export const getBotByWorkspaceId = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetBotByWorkspaceIdV1, req);
  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Integrations
  );

  let bot = await Bot.findOne({
    workspace: workspaceId
  });

  if (!bot) {
    // case: bot doesn't exist for workspace with id [workspaceId]
    // -> create a new bot and return it
    bot = await createBot({
      name: "Infisical Bot",
      workspaceId: new Types.ObjectId(workspaceId)
    });
  }

  return res.status(200).send({
    bot
  });
};

/**
 * Return bot with id [req.bot._id] with active state set to [isActive].
 * @param req
 * @param res
 * @returns
 */
export const setBotActiveState = async (req: Request, res: Response) => {
  const {
    body: { botKey, isActive },
    params: { botId }
  } = await validateRequest(reqValidator.SetBotActiveStateV1, req);

  const bot = await Bot.findById(botId);
  if (!bot) {
    throw BadRequestError({ message: "Bot not found" });
  }
  const userId = req.user._id;

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: bot.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Integrations
  );

  if (isActive) {
    // bot state set to active -> share workspace key with bot
    if (!botKey?.encryptedKey || !botKey?.nonce) {
      return res.status(400).send({
        message: "Failed to set bot state to active - missing bot key"
      });
    }

    await BotKey.findOneAndUpdate(
      {
        workspace: bot.workspace
      },
      {
        encryptedKey: botKey.encryptedKey,
        nonce: botKey.nonce,
        sender: userId,
        bot: bot._id,
        workspace: bot.workspace
      },
      {
        upsert: true,
        new: true
      }
    );
  } else {
    // case: bot state set to inactive -> delete bot's workspace key
    await BotKey.deleteOne({
      bot: bot._id
    });
  }

  const updatedBot = await Bot.findOneAndUpdate(
    {
      _id: bot._id
    },
    {
      isActive
    },
    {
      new: true
    }
  );

  if (!updatedBot) throw new Error("Failed to update bot active state");

  return res.status(200).send({
    bot
  });
};
