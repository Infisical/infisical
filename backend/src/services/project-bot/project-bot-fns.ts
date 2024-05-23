import { SecretKeyEncoding } from "@app/db/schemas";
import { decryptAsymmetric, infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
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

    const bot = await projectBotDAL.findOne({ projectId: project.id });

    if (!bot) throw new BadRequestError({ message: "Failed to find bot key" });
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

  return getBotKeyFn;
};
