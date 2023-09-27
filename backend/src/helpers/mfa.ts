import { IUser, MfaMethod } from "../models";

export const hasMultipleMfaMethods = (user: IUser): boolean => {
  const mfaMethodsExcludingRecoveryCodes = user.mfaMethods?.filter(
    (method) => method !== MfaMethod.MFA_RECOVERY_CODES
  );

  if (!mfaMethodsExcludingRecoveryCodes) return false;

  return mfaMethodsExcludingRecoveryCodes.length > 0;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeAllMfaProperites = (user: any) => {
  try {
    user.isMfaEnabled = false;
    user.mfaMethods = [];
    user.mfaPreference = undefined;
    user.authAppSecretKeyCipherText = undefined;
    user.authAppSecretKeyIV = undefined;
    user.authAppSecretKeyTag = undefined;
    user.mfaRecoveryCodesCipherText = undefined;
    user.mfaRecoveryCodesIV = undefined;
    user.mfaRecoveryCodesTag = undefined;
    delete user.mfaRecoveryCodesCount;
  } catch (err) {
    throw new Error ("Error removing MFA recovery code properties")
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeMfaRecoveryCodes = (user: any) => {
  try {
    user.mfaRecoveryCodesCipherText = undefined;
    user.mfaRecoveryCodesIV = undefined;
    user.mfaRecoveryCodesTag = undefined;
    delete user.mfaRecoveryCodesCount;
    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.MFA_RECOVERY_CODES);
  } catch (err) {
    throw new Error ("Error removing MFA recovery code properties")
  }
};
