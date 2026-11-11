import { ProjectVersion } from "@app/db/schemas";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { recordLegacyRootKeyUsageMetric } from "@app/lib/telemetry/metrics";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "./project-bot-dal";
import { getBotKeyFnFactory, getBotPrivateKey } from "./project-bot-fns";
import { TFindBotByProjectIdDTO, TSetActiveStateDTO } from "./project-bot-types";

type TProjectBotServiceFactoryDep = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectBotDAL: TProjectBotDALFactory;
};

export type TProjectBotServiceFactory = ReturnType<typeof projectBotServiceFactory>;

export const projectBotServiceFactory = ({
  projectBotDAL,
  projectDAL,
  projectsDomain
}: TProjectBotServiceFactoryDep) => {
  const getBotKeyFn = getBotKeyFnFactory(projectBotDAL, projectDAL);

  const getBotKey = async (projectId: string, shouldGetBotKey?: boolean) => {
    return getBotKeyFn(projectId, shouldGetBotKey);
  };

  const findBotByProjectId = async ({ actor, projectId, privateKey, botKey, publicKey }: TFindBotByProjectIdDTO) => {
    const permission = await projectsDomain.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations });

    const bot = await projectBotDAL.transaction(async (tx) => {
      const doc = await projectBotDAL.findOne({ projectId }, tx);
      if (doc) return doc;

      const keys =
        privateKey && publicKey ? { privateKey, publicKey } : await crypto.encryption().asymmetric().generateKeyPair();

      recordLegacyRootKeyUsageMetric({ operation: "encrypt", surface: "project_bot" });
      logger.info(`Legacy root key used to create a project bot [projectId=${projectId}]`);
      const { iv, tag, ciphertext, encoding, algorithm } = crypto
        .encryption()
        .symmetric()
        .encryptWithRootEncryptionKey(keys.privateKey);

      const project = await projectDAL.findById(projectId, tx);

      if (project.version === ProjectVersion.V2 || project.version === ProjectVersion.V3) {
        throw new BadRequestError({ message: "Failed to create bot, project is upgraded." });
      }

      return projectBotDAL.create(
        {
          name: "Infisical Bot",
          projectId,
          tag,
          iv,
          encryptedPrivateKey: ciphertext,
          isActive: false,
          publicKey: keys.publicKey,
          algorithm,
          keyEncoding: encoding,
          ...(botKey && {
            encryptedProjectKey: botKey.encryptedKey,
            encryptedProjectKeyNonce: botKey.nonce
          })
        },
        tx
      );
    });
    return bot;
  };

  const findProjectByBotId = async (botId: string) => {
    try {
      const bot = await projectBotDAL.findProjectByBotId(botId);
      return bot;
    } catch (e) {
      throw new NotFoundError({ message: `Project bot with ID '${botId}' not found` });
    }
  };

  const setBotActiveState = async ({ actor, botId, botKey, isActive }: TSetActiveStateDTO) => {
    const bot = await projectBotDAL.findById(botId);
    if (!bot) throw new NotFoundError({ message: `Project bot with ID '${botId}' not found` });

    const permission = await projectsDomain.getProjectPermission({ actor, projectId: bot.projectId });
    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Integrations });

    const project = await projectBotDAL.findProjectByBotId(botId);

    if (!project) {
      throw new NotFoundError({ message: `Project not found for bot with ID '${botId}'` });
    }

    if (project.version === ProjectVersion.V2) {
      throw new BadRequestError({ message: "Failed to set bot active for upgraded project. Bot is already active" });
    }

    if (isActive) {
      if (!botKey?.nonce || !botKey?.encryptedKey) {
        throw new NotFoundError({
          message: `Bot key not found for bot in project with ID '${botId}'. Failed to set bot state to active.`
        });
      }
      const doc = await projectBotDAL.updateById(botId, {
        isActive: true,
        encryptedProjectKey: botKey.encryptedKey,
        encryptedProjectKeyNonce: botKey.nonce,
        senderId: actor.principal.id
      });
      if (!doc)
        throw new BadRequestError({ message: `Project bot with ID '${botId}' not found. Failed to update bot.` });
      return doc;
    }

    const doc = await projectBotDAL.updateById(botId, {
      isActive: false,
      encryptedProjectKey: null,
      encryptedProjectKeyNonce: null
    });
    if (!doc) throw new BadRequestError({ message: `Project bot with ID '${botId}' not found. Failed to update bot.` });
    return doc;
  };

  return {
    findBotByProjectId,
    setBotActiveState,
    getBotPrivateKey,
    findProjectByBotId,
    getBotKey
  };
};
