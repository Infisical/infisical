import { authenticator } from "otplib";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserDALFactory } from "../user/user-dal";
import { TTotpConfigDALFactory } from "./totp-config-dal";
import {
  TDeleteUserTotpConfigDTO,
  TGetUserTotpConfigDTO,
  TRegisterUserTotpDTO,
  TVerifyUserTotpConfigDTO,
  TVerifyUserTotpDTO
} from "./totp-types";

type TTotpServiceFactoryDep = {
  userDAL: TUserDALFactory;
  totpConfigDAL: TTotpConfigDALFactory;
  kmsService: TKmsServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
};

authenticator.options = { window: 1 };

export type TTotpServiceFactory = ReturnType<typeof totpServiceFactory>;

export const totpServiceFactory = ({ totpConfigDAL, kmsService, userDAL, keyStore }: TTotpServiceFactoryDep) => {
  const getUserTotpConfig = async ({ userId }: TGetUserTotpConfigDTO) => {
    const totpConfig = await totpConfigDAL.findOne({
      userId
    });

    if (!totpConfig) {
      throw new NotFoundError({
        message: "TOTP configuration not found"
      });
    }

    if (!totpConfig.isVerified) {
      throw new BadRequestError({
        message: "TOTP configuration has not been verified"
      });
    }

    return {
      isVerified: totpConfig.isVerified
    };
  };

  const registerUserTotp = async ({ userId }: TRegisterUserTotpDTO) => {
    const totpConfig = await totpConfigDAL.transaction(async (tx) => {
      const verifiedTotpConfig = await totpConfigDAL.findOne(
        {
          userId,
          isVerified: true
        },
        tx
      );

      if (verifiedTotpConfig) {
        throw new BadRequestError({
          message: "TOTP configuration for user already exists"
        });
      }

      const unverifiedTotpConfig = await totpConfigDAL.findOne({
        userId,
        isVerified: false
      });

      if (unverifiedTotpConfig) {
        return unverifiedTotpConfig;
      }

      const encryptWithRoot = kmsService.encryptWithRootKey();

      // create new TOTP configuration
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptWithRoot(Buffer.from(secret));
      const newTotpConfig = await totpConfigDAL.create({
        userId,
        encryptedSecret
      });

      return newTotpConfig;
    });

    const user = await userDAL.findById(userId);
    const decryptWithRoot = kmsService.decryptWithRootKey();

    const secret = decryptWithRoot(totpConfig.encryptedSecret).toString();
    const otpUrl = authenticator.keyuri(user.username, "Infisical", secret);

    return {
      otpUrl
    };
  };

  const verifyUserTotpConfig = async ({ userId, totp }: TVerifyUserTotpConfigDTO) => {
    const totpConfig = await totpConfigDAL.findOne({
      userId
    });

    if (!totpConfig) {
      throw new NotFoundError({
        message: "TOTP configuration not found"
      });
    }

    if (totpConfig.isVerified) {
      throw new BadRequestError({
        message: "TOTP configuration has already been verified"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const secret = decryptWithRoot(totpConfig.encryptedSecret).toString();
    const isValid = authenticator.verify({
      token: totp,
      secret
    });

    if (!isValid) {
      throw new BadRequestError({
        message: "Invalid TOTP token"
      });
    }

    await totpConfigDAL.updateById(totpConfig.id, {
      isVerified: true
    });

    return {
      success: true
    };
  };

  const verifyUserTotp = async ({ userId, totp }: TVerifyUserTotpDTO) => {
    const totpConfig = await totpConfigDAL.findOne({
      userId
    });

    if (!totpConfig) {
      throw new NotFoundError({
        message: "TOTP configuration not found"
      });
    }

    if (!totpConfig.isVerified) {
      throw new BadRequestError({
        message: "TOTP configuration has not been verified"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const secret = decryptWithRoot(totpConfig.encryptedSecret).toString();
    const isValid = authenticator.verify({
      token: totp,
      secret
    });

    if (!isValid) {
      throw new ForbiddenRequestError({
        message: "Invalid TOTP"
      });
    }

    const claimed = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.UsedTotpCode(userId, totp),
      KeyStoreTtls.UsedTotpCodeInSeconds,
      "1"
    );
    if (!claimed) {
      throw new ForbiddenRequestError({ message: "Invalid TOTP" });
    }
  };

  const deleteUserTotpConfig = async ({ userId }: TDeleteUserTotpConfigDTO) => {
    const totpConfig = await totpConfigDAL.findOne({
      userId
    });

    if (!totpConfig) {
      throw new NotFoundError({
        message: "TOTP configuration not found"
      });
    }

    await totpConfigDAL.deleteById(totpConfig.id);
  };

  return {
    registerUserTotp,
    verifyUserTotpConfig,
    getUserTotpConfig,
    verifyUserTotp,
    deleteUserTotpConfig
  };
};
