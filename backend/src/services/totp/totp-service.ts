import { authenticator } from "otplib";

import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserDALFactory } from "../user/user-dal";
import { TTotpConfigDALFactory } from "./totp-config-dal";
import { generateRecoveryCode } from "./totp-fns";
import {
  TCreateUserTotpRecoveryCodesDTO,
  TDeleteUserTotpConfigDTO,
  TGetUserTotpConfigDTO,
  TRegisterUserTotpDTO,
  TVerifyUserTotpConfigDTO,
  TVerifyUserTotpDTO,
  TVerifyWithUserRecoveryCodeDTO
} from "./totp-types";

type TTotpServiceFactoryDep = {
  userDAL: TUserDALFactory;
  totpConfigDAL: TTotpConfigDALFactory;
  kmsService: TKmsServiceFactory;
};

export type TTotpServiceFactory = ReturnType<typeof totpServiceFactory>;

const MAX_RECOVERY_CODE_LIMIT = 10;

export const totpServiceFactory = ({ totpConfigDAL, kmsService, userDAL }: TTotpServiceFactoryDep) => {
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

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const recoveryCodes = decryptWithRoot(totpConfig.encryptedRecoveryCodes).toString().split(",");

    return {
      isVerified: totpConfig.isVerified,
      recoveryCodes
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
      const recoveryCodes = Array.from({ length: MAX_RECOVERY_CODE_LIMIT }).map(generateRecoveryCode);
      const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(recoveryCodes.join(",")));
      const newTotpConfig = await totpConfigDAL.create({
        userId,
        encryptedRecoveryCodes,
        encryptedSecret
      });

      return newTotpConfig;
    });

    const user = await userDAL.findById(userId);
    const decryptWithRoot = kmsService.decryptWithRootKey();

    const secret = decryptWithRoot(totpConfig.encryptedSecret).toString();
    const recoveryCodes = decryptWithRoot(totpConfig.encryptedRecoveryCodes).toString().split(",");
    const otpUrl = authenticator.keyuri(user.username, "Infisical", secret);

    return {
      otpUrl,
      recoveryCodes
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

    if (isValid) {
      await totpConfigDAL.updateById(totpConfig.id, {
        isVerified: true
      });
    } else {
      throw new BadRequestError({
        message: "Invalid TOTP token"
      });
    }
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
  };

  const verifyWithUserRecoveryCode = async ({ userId, recoveryCode }: TVerifyWithUserRecoveryCodeDTO) => {
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
    const encryptWithRoot = kmsService.encryptWithRootKey();

    const recoveryCodes = decryptWithRoot(totpConfig.encryptedRecoveryCodes).toString().split(",");
    const matchingCode = recoveryCodes.find((code) => recoveryCode === code);
    if (!matchingCode) {
      throw new ForbiddenRequestError({
        message: "Invalid TOTP recovery code"
      });
    }

    const updatedRecoveryCodes = recoveryCodes.filter((code) => code !== matchingCode);
    const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(updatedRecoveryCodes.join(",")));
    await totpConfigDAL.updateById(totpConfig.id, {
      encryptedRecoveryCodes
    });
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

  const createUserTotpRecoveryCodes = async ({ userId }: TCreateUserTotpRecoveryCodesDTO) => {
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const encryptWithRoot = kmsService.encryptWithRootKey();

    return totpConfigDAL.transaction(async (tx) => {
      const totpConfig = await totpConfigDAL.findOne(
        {
          userId,
          isVerified: true
        },
        tx
      );

      if (!totpConfig) {
        throw new NotFoundError({
          message: "Valid TOTP configuration not found"
        });
      }

      const recoveryCodes = decryptWithRoot(totpConfig.encryptedRecoveryCodes).toString().split(",");
      if (recoveryCodes.length >= MAX_RECOVERY_CODE_LIMIT) {
        throw new BadRequestError({
          message: `Cannot have more than ${MAX_RECOVERY_CODE_LIMIT} recovery codes at a time`
        });
      }

      const toGenerateCount = MAX_RECOVERY_CODE_LIMIT - recoveryCodes.length;
      const newRecoveryCodes = Array.from({ length: toGenerateCount }).map(generateRecoveryCode);
      const encryptedRecoveryCodes = encryptWithRoot(Buffer.from([...recoveryCodes, ...newRecoveryCodes].join(",")));

      await totpConfigDAL.updateById(totpConfig.id, {
        encryptedRecoveryCodes
      });
    });
  };

  return {
    registerUserTotp,
    verifyUserTotpConfig,
    getUserTotpConfig,
    verifyUserTotp,
    verifyWithUserRecoveryCode,
    deleteUserTotpConfig,
    createUserTotpRecoveryCodes
  };
};
