/* eslint-disable @typescript-eslint/no-unused-vars */
import { decryptSymmetric128BitHexKeyUTF8, encryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { NotFoundError } from "@app/lib/errors";

import { TUserDALFactory } from "../user/user-dal";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import {
  type CreditCard,
  type NewUserSecretDTO,
  type SecretType,
  type SecureNote,
  type UserSecret,
  type WebLogin
} from "./user-secrets-types";

type TUserSecretsServiceFactoryDep = {
  userSecretsDAL: TUserSecretsDALFactory;
  userDAL: TUserDALFactory;
};

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

export const userSecretsServiceFactory = ({ userSecretsDAL, userDAL }: TUserSecretsServiceFactoryDep) => {
  const getDataByType = (userSecret: NewUserSecretDTO) => {
    switch (userSecret.type) {
      case "webLogin":
        return {
          secretValue: userSecret.password,
          extraData: {
            username: userSecret.username
          }
        };
      case "creditCard":
        return {
          secretValue: userSecret.cardNumber,
          extraData: {
            expiryData: userSecret.expiryDate,
            cvv: userSecret.cvv
          }
        };
      case "secureNote":
      default:
        return {
          secretValue: userSecret.content,
          extraData: {}
        };
    }
  };

  const getUserSecrets = async (userId: string) => {
    // const userSecrets = await userSecretsDAL.findByUserId(userId);
    // const user = await userDAL.findUserEncKeyByUserId(userId);
    // if (!user) {
    //   throw new NotFoundError({
    //     name: "User not found for user secrets",
    //     message: `User with id ${userId} was not found`
    //   });
    // }
    // const plainUserSecrets = userSecrets.map((secret) => {
    //   const type: SecretType = secret.type;
    //   const plainValue = decryptSymmetric128BitHexKeyUTF8({
    //     ciphertext: secret.ciphertext,
    //     iv: secret.iv,
    //     tag: secret.tag,
    //     key: user.publicKey
    //   });
    //   const extraData = JSON.parse(secret.extraData || {});
    //   switch (type) {
    //     case "webLogin":
    //       return {
    //         password: plainValue,
    //         ...secret,
    //         ...extraData
    //       } as WebLogin;
    //     case "creditCard":
    //       return {
    //         cardNumber: plainValue,
    //         ...secret,
    //         ...extraData
    //       } as CreditCard;
    //     case "secureNote":
    //       return {
    //         content: plainValue,
    //         ...secret,
    //         ...extraData
    //       } as SecureNote;
    //   }
    // });
    // return plainUserSecrets;
  };

  const createUserSecret = async (userId: string, newUserSecret: NewUserSecretDTO) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);

    if (!user) {
      throw new NotFoundError({
        name: "User not found for user secrets",
        message: `User with id ${userId} was not found`
      });
    }

    const { secretValue, extraData } = getDataByType(newUserSecret);

    const encryptedData = encryptSymmetric128BitHexKeyUTF8(secretValue, user.publicKey);

    return userSecretsDAL.create({
      name: newUserSecret.name,
      type: newUserSecret.type,
      extraData,
      ...encryptedData
    });
  };

  const updateUserSecret = async (userSecretId: string, userId: string, updatedUserSecret: NewUserSecretDTO) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);

    if (!user) {
      throw new NotFoundError({
        name: "User not found for user secrets",
        message: `User with id ${userId} was not found`
      });
    }

    const { secretValue, extraData } = getDataByType(updatedUserSecret);

    const encryptedData = encryptSymmetric128BitHexKeyUTF8(secretValue, user.publicKey);

    return userSecretsDAL.update(userSecretId, {
      name: updatedUserSecret.name,
      type: updatedUserSecret.type,
      extraData,
      ...encryptedData
    });
  };

  const deleteUserSecret = async (userSecretId: string) => {
    return userSecretsDAL.del(userSecretId);
  };

  return {
    getUserSecrets,
    createUserSecret,
    updateUserSecret,
    deleteUserSecret
  };
};
