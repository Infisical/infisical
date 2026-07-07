import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserDALFactory } from "../user/user-dal";
import { TMfaRecoveryCodeDALFactory } from "./mfa-recovery-code-dal";
import { generateRecoveryCode } from "./mfa-recovery-code-fns";
import {
  TEnsureRecoveryCodesDTO,
  TGetRecoveryCodesDTO,
  TRotateRecoveryCodesDTO,
  TVerifyAndConsumeRecoveryCodeDTO
} from "./mfa-recovery-code-types";

type TMfaRecoveryCodeServiceFactoryDep = {
  mfaRecoveryCodeDAL: TMfaRecoveryCodeDALFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey">;
};

export type TMfaRecoveryCodeServiceFactory = ReturnType<typeof mfaRecoveryCodeServiceFactory>;

const MAX_RECOVERY_CODE_LIMIT = 10;

export const mfaRecoveryCodeServiceFactory = ({
  mfaRecoveryCodeDAL,
  userDAL,
  kmsService
}: TMfaRecoveryCodeServiceFactoryDep) => {
  // Generates a fresh pool of recovery codes alongside its root-key ciphertext.
  const generateEncryptedRecoveryCodes = () => {
    const encryptWithRoot = kmsService.encryptWithRootKey();
    const recoveryCodes = Array.from({ length: MAX_RECOVERY_CODE_LIMIT }).map(generateRecoveryCode);
    const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(recoveryCodes.join(",")));

    return { recoveryCodes, encryptedRecoveryCodes };
  };

  const getRecoveryCodes = async ({ userId }: TGetRecoveryCodesDTO) => {
    const recoveryCodeConfig = await mfaRecoveryCodeDAL.findOne({ userId });

    if (!recoveryCodeConfig) {
      throw new NotFoundError({
        message: "Recovery codes not found"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const recoveryCodes = decryptWithRoot(recoveryCodeConfig.encryptedRecoveryCodes)
      .toString()
      .split(",")
      .filter(Boolean);

    return recoveryCodes;
  };

  const verifyAndConsumeRecoveryCode = async ({ userId, recoveryCode }: TVerifyAndConsumeRecoveryCodeDTO) => {
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const encryptWithRoot = kmsService.encryptWithRootKey();

    return mfaRecoveryCodeDAL.transaction(async (tx) => {
      // Lock the row FOR UPDATE so concurrent logins presenting the same code
      // can't both read the pre-consumption pool and each succeed on one code.
      const recoveryCodeConfig = await mfaRecoveryCodeDAL.findOneByUserIdForUpdate(userId, tx);

      if (!recoveryCodeConfig) {
        throw new NotFoundError({
          message: "Recovery codes not found"
        });
      }

      const recoveryCodes = decryptWithRoot(recoveryCodeConfig.encryptedRecoveryCodes)
        .toString()
        .split(",")
        .filter(Boolean);
      const remainingRecoveryCodes = recoveryCodes.filter((code) => code !== recoveryCode);
      if (remainingRecoveryCodes.length === recoveryCodes.length) {
        throw new ForbiddenRequestError({
          message: "Invalid recovery code"
        });
      }

      const encryptedRecoveryCodes = encryptWithRoot(Buffer.from(remainingRecoveryCodes.join(",")));
      await mfaRecoveryCodeDAL.updateById(
        recoveryCodeConfig.id,
        {
          encryptedRecoveryCodes
        },
        tx
      );
    });
  };

  /**
   * Generates a completely new set of recovery codes, invalidating any existing
   * ones. Returns the fresh codes so the caller can display them once. If no
   * pool exists yet it is created.
   */
  const rotateRecoveryCodes = async ({ userId, tx: externalTx, skipMfaEnabledCheck }: TRotateRecoveryCodesDTO) => {
    if (!skipMfaEnabledCheck) {
      const user = await userDAL.findById(userId, externalTx);
      if (!user?.isMfaEnabled) {
        throw new BadRequestError({
          message: "Cannot regenerate recovery codes: MFA is not enabled for this account"
        });
      }
    }

    const { recoveryCodes, encryptedRecoveryCodes } = generateEncryptedRecoveryCodes();

    await mfaRecoveryCodeDAL.upsert([{ userId, encryptedRecoveryCodes }], "userId", externalTx);

    return recoveryCodes;
  };

  /**
   * Mints the initial recovery-code pool the first time a user enrolls an MFA
   * factor. If a pool already exists (e.g. enrolling a second factor) it is left
   * untouched so previously saved codes stay valid, and `undefined` is returned.
   * Returns the freshly minted codes so the caller can display them once.
   */
  const ensureRecoveryCodes = async ({ userId, tx }: TEnsureRecoveryCodesDTO) => {
    const existingConfig = await mfaRecoveryCodeDAL.findOne({ userId }, tx);
    if (existingConfig) return undefined;

    return rotateRecoveryCodes({ userId, tx, skipMfaEnabledCheck: true });
  };

  return {
    getRecoveryCodes,
    verifyAndConsumeRecoveryCode,
    rotateRecoveryCodes,
    ensureRecoveryCodes
  };
};
