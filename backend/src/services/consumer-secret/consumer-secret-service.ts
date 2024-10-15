import { TConsumerSecrets } from "@app/db/schemas/consumer-secrets";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TConsumerSecretDALFactory } from "./consumer-secret-dal";
import {
  dbResultToConsumerSecret,
  insertDocFromCreateDTO
} from './consumer-secret-fns'
import {
  TCreateConsumerSecretDTO,
  TListConsumerSecretDTO,
  TUpdateConsumerSecretDTO,
  TDeleteConsumerSecretDTO,
  SecretTypeUnion,
  ConsumerSecretTypes
} from './consumer-secret-types'

type TConsumerSecretServiceFactoryDep = {
  consumerSecretDAL: TConsumerSecretDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TConsumerSecretServiceFactory = ReturnType<typeof consumerSecretServiceFactory>;

export const consumerSecretServiceFactory = ({ consumerSecretDAL, kmsService }: TConsumerSecretServiceFactoryDep) => {
  // Helper to encrypt and decrypt data
  const encryptData = async (orgId: string, data: string) => {
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const { cipherTextBlob } = encryptor({ plainText: Buffer.from(data, "utf-8") });
    return cipherTextBlob.toString("base64");
  };

  const decryptData = async (orgId: string, encryptedData: string) => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const buffer = decryptor({ cipherTextBlob: Buffer.from(encryptedData, "base64") });
    return buffer.toString("utf-8");
  };

  // Helper to build secret data for updates
  const buildSecretData = (data: SecretTypeUnion) => {
    switch (data.type) {
      case ConsumerSecretTypes.WebLogin:
        return {
          type: data.type,
          url: data.url,
          username: data.username,
          password: data.password
        };
      case ConsumerSecretTypes.CreditCard:
        return {
          type: data.type,
          nameOnCard: data.nameOnCard,
          cardNumber: data.cardNumber,
          validThrough: data.validThrough,
          cvv: data.cvv
        };
      case ConsumerSecretTypes.PrivateNote:
        return {
          type: data.type,
          title: data.title,
          content: data.content
        };
      default:
          const _exhaustiveCheck: never = data;
          throw new Error(`Unsupported secret type: ${JSON.stringify(data)}`);
    }
  };

  // Create Consumer Secret
  const createConsumerSecret = async (createDto: TCreateConsumerSecretDTO) => {
    const insertDoc = insertDocFromCreateDTO(createDto);
    insertDoc.data = await encryptData(insertDoc.orgId, insertDoc.data);
    const consumerSecret = await consumerSecretDAL.create(insertDoc);
    consumerSecret.data = await decryptData(consumerSecret.orgId, consumerSecret.data);
    return dbResultToConsumerSecret(consumerSecret);
  };

  // List Consumer Secrets
  const listConsumerSecrets = async ({ orgId, actorId, offset, limit }: TListConsumerSecretDTO) => {
    const secrets = await consumerSecretDAL.find({ orgId, userId: actorId }, { offset, limit, sort: [["name", "asc"]] });
    const decryptedSecrets = await Promise.all(
      secrets.map(async (secret) => ({
        ...secret,
        data: await decryptData(secret.orgId, secret.data)
      }))
    );
    const totalCount = await consumerSecretDAL.getConsumerSecretCount({ orgId });
    return { secrets: decryptedSecrets.map(dbResultToConsumerSecret), totalCount: Number(totalCount) };
  };

  // Update Consumer Secret
  const updateConsumerSecret = async ({ id, name, data }: TUpdateConsumerSecretDTO) => {
    const existingSecret = await consumerSecretDAL.findById(id);
    if (!existingSecret) {
      throw new Error("User secret not found");
    }
    const updateDoc: TConsumerSecrets = { ...existingSecret, ...(name && { name }) };

    if (data) {
      const updatedData = buildSecretData(data);
      updateDoc.data = await encryptData(existingSecret.orgId, JSON.stringify(updatedData));
    }

    const updatedConsumerSecret = await consumerSecretDAL.updateById(id, updateDoc);
    updatedConsumerSecret.data = await decryptData(updatedConsumerSecret.orgId, updatedConsumerSecret.data);
    return dbResultToConsumerSecret(updatedConsumerSecret);
  };

  // Delete Consumer Secret
  const deleteConsumerSecret = async ({ id }: TDeleteConsumerSecretDTO) => {
    return await consumerSecretDAL.deleteById(id);
  };

  return {
    createConsumerSecret,
    listConsumerSecrets,
    updateConsumerSecret,
    deleteConsumerSecret
  };
};
