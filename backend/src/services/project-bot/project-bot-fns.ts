import { SecretKeyEncoding } from "@app/db/schemas";
import {
  decryptAsymmetric,
  encryptAsymmetric,
  generateAsymmetricKeyPair,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";

import { TProjectDALFactory } from "../project/project-dal";
import { TGetPrivateKeyDTO } from "./project-bot-types";

export const getBotPrivateKey = ({ bot }: TGetPrivateKeyDTO) =>
  infisicalSymmetricDecrypt({
    keyEncoding: bot.keyEncoding as SecretKeyEncoding,
    iv: bot.iv,
    tag: bot.tag,
    ciphertext: bot.encryptedPrivateKey
  });

export const getBotKeyFnFactory = (
  projectBotDAL: TProjectBotDALFactory,
  projectDAL: Pick<TProjectDALFactory, "findById">
) => {
  const getBotKeyFn = async (projectId: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found during bot lookup." });

    if (project.version === 3) {
      return { project, shouldUseSecretV2Bridge: true };
    }

    const bot = await projectBotDAL.findOne({ projectId: project.id });
    if (!bot || !bot.isActive || !bot.encryptedProjectKey || !bot.encryptedProjectKeyNonce) {
      // trying to set bot automatically
      const projectV1Keys = await projectBotDAL.findProjectUserWorkspaceKey(projectId);
      if (!projectV1Keys) throw new BadRequestError({ message: "Bot not found. Please ask admin user to login" });

      let userPrivateKey = "";
      if (
        projectV1Keys?.serverEncryptedPrivateKey &&
        projectV1Keys.serverEncryptedPrivateKeyIV &&
        projectV1Keys.serverEncryptedPrivateKeyTag &&
        projectV1Keys.serverEncryptedPrivateKeyEncoding
      ) {
        userPrivateKey = infisicalSymmetricDecrypt({
          iv: projectV1Keys.serverEncryptedPrivateKeyIV,
          tag: projectV1Keys.serverEncryptedPrivateKeyTag,
          ciphertext: projectV1Keys.serverEncryptedPrivateKey,
          keyEncoding: projectV1Keys.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
        });
      }
      const workspaceKey = decryptAsymmetric({
        ciphertext: projectV1Keys.projectEncryptedKey,
        nonce: projectV1Keys.projectKeyNonce,
        publicKey: projectV1Keys.senderPublicKey,
        privateKey: userPrivateKey
      });
      const botKey = generateAsymmetricKeyPair();
      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(botKey.privateKey);
      const encryptedWorkspaceKey = encryptAsymmetric(workspaceKey, botKey.publicKey, userPrivateKey);

      if (!bot) {
        await projectBotDAL.create({
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
      } else {
        await projectBotDAL.updateById(bot.id, {
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
      }
      return { botKey: workspaceKey, project, shouldUseSecretV2Bridge: false };
    }

    const botPrivateKey = getBotPrivateKey({ bot });
    const botKey = decryptAsymmetric({
      ciphertext: bot.encryptedProjectKey,
      privateKey: botPrivateKey,
      nonce: bot.encryptedProjectKeyNonce,
      publicKey: bot.sender.publicKey
    });
    return { botKey, project, shouldUseSecretV2Bridge: false };
  };

  return getBotKeyFn;
};
