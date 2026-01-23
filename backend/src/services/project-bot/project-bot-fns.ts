import { SecretKeyEncoding } from "@app/db/schemas/models";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";

import { TProjectDALFactory } from "../project/project-dal";
import { TGetPrivateKeyDTO } from "./project-bot-types";

export const getBotPrivateKey = ({ bot }: TGetPrivateKeyDTO) => {
  return crypto
    .encryption()
    .symmetric()
    .decryptWithRootEncryptionKey({
      keyEncoding: bot.keyEncoding as SecretKeyEncoding,
      iv: bot.iv,
      tag: bot.tag,
      ciphertext: bot.encryptedPrivateKey
    });
};

export const getBotKeyFnFactory = (
  projectBotDAL: TProjectBotDALFactory,
  projectDAL: Pick<TProjectDALFactory, "findById">
) => {
  const getBotKeyFn = async (projectId: string, shouldGetBotKey?: boolean) => {
    const project = await projectDAL.findById(projectId);
    if (!project)
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found during bot lookup. Are you sure you are using the correct project ID?`
      });

    if (project.version === 3 && !shouldGetBotKey) {
      return { project, shouldUseSecretV2Bridge: true };
    }

    const bot = await projectBotDAL.findOne({ projectId: project.id });
    if (!bot || !bot.isActive || !bot.encryptedProjectKey || !bot.encryptedProjectKeyNonce) {
      // trying to set bot automatically
      const projectV1Keys = await projectBotDAL.findProjectUserWorkspaceKey(projectId);
      if (!projectV1Keys) {
        throw new NotFoundError({
          message: `Project bot not found for project with ID '${projectId}'. Please ask an administrator to log-in to the Infisical Console.`
        });
      }

      if (!projectV1Keys.senderPublicKey) {
        throw new NotFoundError({
          message: `Project bot not found for project with ID '${projectId}'. Please ask an administrator to log-in to the Infisical Console and upgrade the project.`
        });
      }

      let userPrivateKey = "";
      if (
        projectV1Keys?.serverEncryptedPrivateKey &&
        projectV1Keys.serverEncryptedPrivateKeyIV &&
        projectV1Keys.serverEncryptedPrivateKeyTag &&
        projectV1Keys.serverEncryptedPrivateKeyEncoding
      ) {
        userPrivateKey = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            iv: projectV1Keys.serverEncryptedPrivateKeyIV,
            tag: projectV1Keys.serverEncryptedPrivateKeyTag,
            ciphertext: projectV1Keys.serverEncryptedPrivateKey,
            keyEncoding: projectV1Keys.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
          });
      }
      const workspaceKey = crypto.encryption().asymmetric().decrypt({
        ciphertext: projectV1Keys.projectEncryptedKey,
        nonce: projectV1Keys.projectKeyNonce,
        publicKey: projectV1Keys.senderPublicKey,
        privateKey: userPrivateKey
      });
      const botKey = await crypto.encryption().asymmetric().generateKeyPair();
      const { iv, tag, ciphertext, encoding, algorithm } = crypto
        .encryption()
        .symmetric()
        .encryptWithRootEncryptionKey(botKey.privateKey);
      const encryptedWorkspaceKey = crypto
        .encryption()
        .asymmetric()
        .encrypt(workspaceKey, botKey.publicKey, userPrivateKey);

      let botId;
      if (!bot) {
        const newBot = await projectBotDAL.create({
          name: "Infisical Bot (Ghost)",
          projectId,
          isActive: true,
          tag,
          iv,
          encryptedPrivateKey: ciphertext,
          publicKey: botKey.publicKey,
          algorithm,
          keyEncoding: encoding,
          encryptedProjectKey: encryptedWorkspaceKey.ciphertext,
          encryptedProjectKeyNonce: encryptedWorkspaceKey.nonce,
          senderId: projectV1Keys.userId
        });
        botId = newBot.id;
      } else {
        const updatedBot = await projectBotDAL.updateById(bot.id, {
          isActive: true,
          tag,
          iv,
          encryptedPrivateKey: ciphertext,
          publicKey: botKey.publicKey,
          algorithm,
          keyEncoding: encoding,
          encryptedProjectKey: encryptedWorkspaceKey.ciphertext,
          encryptedProjectKeyNonce: encryptedWorkspaceKey.nonce,
          senderId: projectV1Keys.userId
        });
        botId = updatedBot.id;
      }

      return { botKey: workspaceKey, project, shouldUseSecretV2Bridge: false, bot: { id: botId } };
    }

    const botPrivateKey = getBotPrivateKey({ bot });
    const botKey = crypto.encryption().asymmetric().decrypt({
      ciphertext: bot.encryptedProjectKey,
      privateKey: botPrivateKey,
      nonce: bot.encryptedProjectKeyNonce,
      publicKey: bot.sender.publicKey
    });
    return { botKey, project, shouldUseSecretV2Bridge: false, bot: { id: bot.id } };
  };

  return getBotKeyFn;
};
