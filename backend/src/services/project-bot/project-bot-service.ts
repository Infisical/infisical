import { ForbiddenError } from "@casl/ability";

import { ProjectVersion, SecretKeyEncoding } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { decryptAsymmetric, generateAsymmetricKeyPair } from "@app/lib/crypto";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "./project-bot-dal";
import { TFindBotByProjectIdDTO, TGetPrivateKeyDTO, TSetActiveStateDTO } from "./project-bot-types";

type TProjectBotServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectBotDAL: TProjectBotDALFactory;
};

export type TProjectBotServiceFactory = ReturnType<typeof projectBotServiceFactory>;

export const projectBotServiceFactory = ({
  projectBotDAL,
  projectDAL,
  permissionService
}: TProjectBotServiceFactoryDep) => {
  const getBotPrivateKey = ({ bot }: TGetPrivateKeyDTO) =>
    infisicalSymmetricDecrypt({
      keyEncoding: bot.keyEncoding as SecretKeyEncoding,
      iv: bot.iv,
      tag: bot.tag,
      ciphertext: bot.encryptedPrivateKey
    });

  const getBotKey = async (projectId: string) => {
    const bot = await projectBotDAL.findOne({ projectId });
    if (!bot) throw new BadRequestError({ message: "failed to find bot key" });
    if (!bot.isActive) throw new BadRequestError({ message: "Bot is not active" });
    if (!bot.encryptedProjectKeyNonce || !bot.encryptedProjectKey)
      throw new BadRequestError({ message: "Encryption key missing" });

    const botPrivateKey = getBotPrivateKey({ bot });

    return decryptAsymmetric({
      ciphertext: bot.encryptedProjectKey,
      privateKey: botPrivateKey,
      nonce: bot.encryptedProjectKeyNonce,
      publicKey: bot.sender.publicKey
    });
  };

  const findBotByProjectId = async ({
    actorId,
    actor,
    projectId,
    actorOrgId,
    privateKey,
    botKey,
    publicKey
  }: TFindBotByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const bot = await projectBotDAL.transaction(async (tx) => {
      const doc = await projectBotDAL.findOne({ projectId }, tx);
      if (doc) return doc;

      const keys = privateKey && publicKey ? { privateKey, publicKey } : generateAsymmetricKeyPair();

      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(keys.privateKey);

      const project = await projectDAL.findById(projectId, tx);

      if (project.version === ProjectVersion.V2) {
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
      throw new BadRequestError({ message: "Failed to find bot by ID" });
    }
  };

  const setBotActiveState = async ({ actor, botId, botKey, actorId, actorOrgId, isActive }: TSetActiveStateDTO) => {
    const bot = await projectBotDAL.findById(botId);
    if (!bot) throw new BadRequestError({ message: "Bot not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, bot.projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    const project = await projectBotDAL.findProjectByBotId(botId);

    if (!project) {
      throw new BadRequestError({ message: "Failed to find project by bot ID" });
    }

    if (project.version === ProjectVersion.V2) {
      throw new BadRequestError({ message: "Failed to set bot active for upgraded project. Bot is already active" });
    }

    if (isActive) {
      if (!botKey?.nonce || !botKey?.encryptedKey) {
        throw new BadRequestError({ message: "Failed to set bot active - missing bot key" });
      }
      const doc = await projectBotDAL.updateById(botId, {
        isActive: true,
        encryptedProjectKey: botKey.encryptedKey,
        encryptedProjectKeyNonce: botKey.nonce,
        senderId: actorId
      });
      if (!doc) throw new BadRequestError({ message: "Failed to update bot active state" });
      return doc;
    }

    const doc = await projectBotDAL.updateById(botId, {
      isActive: false,
      encryptedProjectKey: null,
      encryptedProjectKeyNonce: null
    });
    if (!doc) throw new BadRequestError({ message: "Failed to update bot active state" });
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
