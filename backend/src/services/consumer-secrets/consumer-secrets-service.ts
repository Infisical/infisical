import { SecretKeyEncoding, TConsumerSecretsInsert } from "@app/db/schemas";
import { TConsumerSecretsDALFactory } from "./consumer-secrets-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { encryptSymmetric } from "@app/lib/crypto";
import { TOrgBotDALFactory } from "../org/org-bot-dal";
import { decryptSymmetric, generateAsymmetricKeyPair, generateSymmetricKey, infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { ConsumerSecretRaw } from "./consumer-secrets-types";
import { v4 as uuidV4 } from "uuid";

type TConsumerSecretsServiceFactoryDep = {
  consumerSecretsDAL: TConsumerSecretsDALFactory;
  orgBotDAL: TOrgBotDALFactory;
};

export type TConsumerSecretsServiceFactory = ReturnType<typeof consumerSecretsServiceFactory>;

export const consumerSecretsServiceFactory = ({ consumerSecretsDAL, orgBotDAL }: TConsumerSecretsServiceFactoryDep) => {
  const getAllMyConsumerSecrets = async (userId: string, organizationId: string) => {
    const consumerSecrets = await consumerSecretsDAL.find({ user: userId });
    const encryptionKey = await getEncryptionKey(organizationId, orgBotDAL);
    return consumerSecrets.map((secret) => {
      const raw: ConsumerSecretRaw = {
        id: secret.id,
        organization: secret.organization,
        user: secret.user,
        plaintextSecret: decryptSymmetric({
          ciphertext: secret.encrypted_data.toString('utf8'),
          key: encryptionKey,
          iv: secret.encryption_iv,
          tag: secret.encryption_tag
        })
      }

      return raw;
    })
  };

  const createConsumerSecret = async (organization: string, user: string, plainTextData: string) => {
    const encryptionKey = await getEncryptionKey(organization, orgBotDAL);

    const { ciphertext, iv, tag } = encryptSymmetric(plainTextData, encryptionKey);

    await consumerSecretsDAL.create({
      id: uuidV4(),
      organization,
      user,
      encrypted_data: Buffer.from(ciphertext, "utf8"),
      encryption_iv: iv,
      encryption_tag: tag,
    });

    return;
  }
  return { getAllMyConsumerSecrets, createConsumerSecret };
};

async function getEncryptionKey(orgId: string, orgBotDAL: TOrgBotDALFactory): Promise<string> {
  const orgBot = await orgBotDAL.findOne({ name: "Admin Org" });

  return infisicalSymmetricDecrypt({
    ciphertext: orgBot.encryptedSymmetricKey,
    iv: orgBot.symmetricKeyIV,
    tag: orgBot.symmetricKeyTag,
    keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
  });
}