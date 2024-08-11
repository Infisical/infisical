import { randomBytes } from "crypto";

import { setKnexStringValue } from "@app/lib/knex";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import { TCreateUserSecretDTO, UserSecretType } from "./user-secrets-types";

type TUserSecretsServiceFactoryDep = {
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userSecretsDAL: TUserSecretsDALFactory;
};

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

export const userSecretsServiceFactory = ({ kmsService, userSecretsDAL }: TUserSecretsServiceFactoryDep) => {
  const cleanupValues = (data: TCreateUserSecretDTO) => {
    const secretInitialValues = data;
    if (data.secretType === UserSecretType.WEB_LOGIN) {
      delete secretInitialValues.cardCvv;
      delete secretInitialValues.cardNumber;
      delete secretInitialValues.cardExpiry;
      delete secretInitialValues.cardLastFourDigits;
      delete secretInitialValues.secureNote;
    } else if (data.secretType === UserSecretType.CREDIT_CARD) {
      delete secretInitialValues.loginURL;
      delete secretInitialValues.username;
      delete secretInitialValues.password;
      delete secretInitialValues.secureNote;
      secretInitialValues.isUsernameSecret = false;
    } else if (data.secretType === UserSecretType.SECURE_NOTE) {
      delete secretInitialValues.loginURL;
      delete secretInitialValues.username;
      delete secretInitialValues.password;
      delete secretInitialValues.cardCvv;
      delete secretInitialValues.cardNumber;
      delete secretInitialValues.cardExpiry;
      delete secretInitialValues.cardLastFourDigits;
      secretInitialValues.isUsernameSecret = false;
    }

    return secretInitialValues;
  };

  const encryptUserSecret = async (data: TCreateUserSecretDTO) => {
    const iv = randomBytes(16).toString("hex");
    const { encryptor: userSecretEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.UserSecret,
      actorId: iv + data.actorId
    });

    return {
      userId: data.actorId,
      orgId: data.orgId,
      secretType: data.secretType,
      name: data.name,
      loginURL: data.loginURL ?? null,
      username: setKnexStringValue(
        data.username,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      password: setKnexStringValue(
        data.password,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      isUsernameSecret: data.isUsernameSecret,
      cardNumber: setKnexStringValue(
        data.cardNumber,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      cardExpiry: setKnexStringValue(
        data.cardExpiry,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      cardLastFourDigits: data.cardLastFourDigits ?? null,
      cardCvv: setKnexStringValue(
        data.cardCvv,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      secureNote: setKnexStringValue(
        data.secureNote,
        (value) => userSecretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
      ),
      iv
    };
  };

  const decryptUserSecret = async (data: Awaited<ReturnType<typeof userSecretsDAL.findOne>>) => {
    const { iv } = data;
    const { decryptor: userSecretDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.UserSecret,
      actorId: iv + data.userId
    });

    return {
      ...data,
      loginURL: data.loginURL ?? null,
      isUsernameSecret: data.isUsernameSecret ?? false,
      secretType: data.secretType as UserSecretType,
      cardLastFourDigits: data.cardLastFourDigits ?? null,
      username: data.username ? userSecretDecryptor({ cipherTextBlob: data.username }).toString() : null,
      password: data.password ? userSecretDecryptor({ cipherTextBlob: data.password }).toString() : null,
      cardNumber: data.cardNumber ? userSecretDecryptor({ cipherTextBlob: data.cardNumber }).toString() : null,
      cardExpiry: data.cardExpiry ? userSecretDecryptor({ cipherTextBlob: data.cardExpiry }).toString() : null,
      cardCvv: data.cardCvv ? userSecretDecryptor({ cipherTextBlob: data.cardCvv }).toString() : null,
      secureNote: data.secureNote ? userSecretDecryptor({ cipherTextBlob: data.secureNote }).toString() : null
    };
  };

  const createUserSecret = async (data: TCreateUserSecretDTO) => {
    const cleanedUpValues = cleanupValues(data);
    const encryptedUserSecret = await encryptUserSecret(cleanedUpValues);

    const newUserSecret = await userSecretsDAL.create(encryptedUserSecret);

    return newUserSecret;
  };

  const updateUserSecret = async (id: string, data: TCreateUserSecretDTO) => {
    const cleanedUpValues = cleanupValues(data);
    const encryptedUserSecret = await encryptUserSecret(cleanedUpValues);

    const secret = await userSecretsDAL.updateById(id, encryptedUserSecret);
    return secret;
  };

  const getAllUserSecrets = async (
    userId: string,
    { offset, limit, secretType }: { offset: number; limit: number; secretType?: UserSecretType }
  ) => {
    const count = await userSecretsDAL.countUserSecrets({ userId, secretType });
    const secrets = await userSecretsDAL.find({ userId, secretType }, { offset, limit });
    const decryptedSecrets = await Promise.all(secrets.map(decryptUserSecret));

    return { count, secrets: decryptedSecrets };
  };

  const deleteUserSecret = async (id: string) => {
    const deletedSecret = await userSecretsDAL.deleteById(id);
    return deletedSecret;
  };

  return {
    createUserSecret,
    updateUserSecret,
    getAllUserSecrets,
    deleteUserSecret
  };
};
