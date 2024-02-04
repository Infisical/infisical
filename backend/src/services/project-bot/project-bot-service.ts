import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import {
  decryptAsymmetric,
  encryptSymmetric,
  encryptSymmetric128BitHexKeyUTF8,
  generateAsymmetricKeyPair
} from "@app/lib/crypto";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TProjectBotDALFactory } from "./project-bot-dal";
import { TGetPrivateKeyDTO, TSetActiveStateDTO } from "./project-bot-types";

type TProjectBotServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectBotDAL: TProjectBotDALFactory;
};

export type TProjectBotServiceFactory = ReturnType<typeof projectBotServiceFactory>;

export const projectBotServiceFactory = ({ projectBotDAL, permissionService }: TProjectBotServiceFactoryDep) => {
  const getBotPrivateKey = async ({ encoding, nonce, tag, encryptedPrivateKey }: TGetPrivateKeyDTO) =>
    infisicalSymmetricDecrypt({
      keyEncoding: encoding,
      iv: nonce,
      tag,
      ciphertext: encryptedPrivateKey
    });

  const getBotKey = async (projectId: string) => {
    const bot = await projectBotDAL.findOne({ projectId });
    if (!bot) throw new BadRequestError({ message: "failed to find bot key" });
    if (!bot.isActive) throw new BadRequestError({ message: "Bot is not active" });
    if (!bot.encryptedProjectKeyNonce || !bot.encryptedProjectKey)
      throw new BadRequestError({ message: "Encryption key missing" });

    const privateKeyBot = await getBotPrivateKey({
      nonce: bot.iv,
      tag: bot.tag,
      encryptedPrivateKey: bot.encryptedPrivateKey,
      encoding: bot.keyEncoding as SecretKeyEncoding
    });

    console.log("privateKeyBot", privateKeyBot);

    return decryptAsymmetric({
      ciphertext: bot.encryptedProjectKey,
      privateKey: privateKeyBot,
      nonce: bot.encryptedProjectKeyNonce,
      publicKey: bot.sender.publicKey
    });
  };

  const findBotByProjectId = async ({ actorId, actor, actorOrgId, projectId }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const appCfg = getConfig();

    const bot = await projectBotDAL.transaction(async (tx) => {
      const doc = await projectBotDAL.findOne({ projectId }, tx);
      if (doc) return doc;

      const { publicKey, privateKey } = generateAsymmetricKeyPair();
      if (appCfg.ROOT_ENCRYPTION_KEY) {
        const { iv, tag, ciphertext } = encryptSymmetric(privateKey, appCfg.ROOT_ENCRYPTION_KEY);
        return projectBotDAL.create(
          {
            name: "Infisical Bot",
            projectId,
            tag,
            iv,
            encryptedPrivateKey: ciphertext,
            isActive: false,
            publicKey,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.BASE64
          },
          tx
        );
      }
      if (appCfg.ENCRYPTION_KEY) {
        const { iv, tag, ciphertext } = encryptSymmetric128BitHexKeyUTF8(privateKey, appCfg.ENCRYPTION_KEY);
        return projectBotDAL.create(
          {
            name: "Infisical Bot",
            projectId,
            tag,
            iv,
            encryptedPrivateKey: ciphertext,
            isActive: false,
            publicKey,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8
          },
          tx
        );
      }
      throw new BadRequestError({ message: "Failed to create bot due to missing encryption key" });
    });
    return bot;
  };

  const setBotActiveState = async ({ actor, botId, botKey, actorId, actorOrgId, isActive }: TSetActiveStateDTO) => {
    const bot = await projectBotDAL.findById(botId);
    if (!bot) throw new BadRequestError({ message: "Bot not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, bot.projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    if (isActive) {
      if (!botKey?.nonce || !botKey?.encryptedKey) {
        throw new BadRequestError({ message: "Failed to set bot active - missing bot key" });
      }
      const doc = await projectBotDAL.updateById(
        botId,
        {
          isActive: true,
          encryptedProjectKey: botKey.encryptedKey,
          encryptedProjectKeyNonce: botKey.nonce,
          senderId: actorId
        },
        tx
      );
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
    getBotKey
  };
};
