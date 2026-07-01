import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TMfaRecoveryCodeDALFactory } from "./mfa-recovery-code-dal";
import { generateRecoveryCode } from "./mfa-recovery-code-fns";
import {
  TDeleteRecoveryCodesDTO,
  TEnsureRecoveryCodesDTO,
  TGetRecoveryCodesDTO,
  TRotateRecoveryCodesDTO,
  TVerifyAndConsumeRecoveryCodeDTO
} from "./mfa-recovery-code-types";

type TMfaRecoveryCodeServiceFactoryDep = {
  mfaRecoveryCodeDAL: TMfaRecoveryCodeDALFactory;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey">;
};

export type TMfaRecoveryCodeServiceFactory = ReturnType<typeof mfaRecoveryCodeServiceFactory>;

const MAX_RECOVERY_CODE_LIMIT = 10;

export const mfaRecoveryCodeServiceFactory = ({
  mfaRecoveryCodeDAL,
  kmsService
}: TMfaRecoveryCodeServiceFactoryDep) => {
  // Generates a fresh pool of recovery codes alongside its root-key ciphertext.
  const generateEncryptedRecoveryCodes = () => {
    const encryptWithRoot = kmsService.encryptWithRootKey();
    const recoveryCodes = Array.from({ length: MAX_RECOVERY_CODE_LIMIT }).map(generateRecoveryCode);
    const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(recoveryCodes.join(",")));

    return { recoveryCodes, encryptedRecoveryCodes };
  };

  /**
   * Ensures the user has an account-level recovery code pool. Idempotent: if a
   * pool already exists (e.g. from a prior TOTP setup) the existing codes are
   * returned unchanged; otherwise a fresh pool of codes is generated.
   * Called from both TOTP and passkey registration.
   */
  const ensureRecoveryCodes = async ({ userId }: TEnsureRecoveryCodesDTO) => {
    const decryptWithRoot = kmsService.decryptWithRootKey();

    return mfaRecoveryCodeDAL.transaction(async (tx) => {
      const existing = await mfaRecoveryCodeDAL.findOne({ userId }, tx);
      if (existing) {
        return decryptWithRoot(existing.encryptedRecoveryCodes).toString().split(",");
      }

      const { recoveryCodes, encryptedRecoveryCodes } = generateEncryptedRecoveryCodes();
      await mfaRecoveryCodeDAL.create({ userId, encryptedRecoveryCodes }, tx);
      return recoveryCodes;
    });
  };

  const getRecoveryCodes = async ({ userId }: TGetRecoveryCodesDTO) => {
    const recoveryCodeConfig = await mfaRecoveryCodeDAL.findOne({ userId });

    if (!recoveryCodeConfig) {
      throw new NotFoundError({
        message: "Recovery codes not found"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const recoveryCodes = decryptWithRoot(recoveryCodeConfig.encryptedRecoveryCodes).toString().split(",");

    return recoveryCodes;
  };

  const verifyAndConsumeRecoveryCode = async ({ userId, recoveryCode }: TVerifyAndConsumeRecoveryCodeDTO) => {
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const encryptWithRoot = kmsService.encryptWithRootKey();

    return mfaRecoveryCodeDAL.transaction(async (tx) => {
      const recoveryCodeConfig = await mfaRecoveryCodeDAL.findOne({ userId }, tx);

      if (!recoveryCodeConfig) {
        throw new NotFoundError({
          message: "Recovery codes not found"
        });
      }

      const recoveryCodes = decryptWithRoot(recoveryCodeConfig.encryptedRecoveryCodes).toString().split(",");
      const remainingRecoveryCodes = recoveryCodes.filter((code) => code !== recoveryCode);
      if (remainingRecoveryCodes.length === recoveryCodes.length) {
        throw new ForbiddenRequestError({
          message: "Invalid recovery code"
        });
      }

      const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(remainingRecoveryCodes.join(",")));
      await mfaRecoveryCodeDAL.updateById(recoveryCodeConfig.id, {
        encryptedRecoveryCodes
      });
    });
  };

  /**
   * Generates a completely new set of recovery codes, invalidating any existing
   * ones. Returns the fresh codes so the caller can display them once. If no
   * pool exists yet it is created.
   */
  const rotateRecoveryCodes = async ({ userId }: TRotateRecoveryCodesDTO) => {
    const { recoveryCodes, encryptedRecoveryCodes } = generateEncryptedRecoveryCodes();

    await mfaRecoveryCodeDAL.transaction(async (tx) => {
      const recoveryCodeConfig = await mfaRecoveryCodeDAL.findOne({ userId }, tx);

      if (recoveryCodeConfig) {
        await mfaRecoveryCodeDAL.updateById(recoveryCodeConfig.id, { encryptedRecoveryCodes }, tx);
      } else {
        await mfaRecoveryCodeDAL.create({ userId, encryptedRecoveryCodes }, tx);
      }
    });

    return recoveryCodes;
  };

  const deleteRecoveryCodes = async ({ userId }: TDeleteRecoveryCodesDTO) => {
    await mfaRecoveryCodeDAL.delete({ userId });
  };

  return {
    ensureRecoveryCodes,
    getRecoveryCodes,
    verifyAndConsumeRecoveryCode,
    rotateRecoveryCodes,
    deleteRecoveryCodes
  };
};
