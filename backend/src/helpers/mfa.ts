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
  const propertiesToDelete = [
    "mfaMethods",
    "mfaPreference",
    "authAppSecretKeyCipherText",
    "authAppSecretKeyIV",
    "authAppSecretKeyTag",
    "mfaRecoveryCodesCipherText",
    "mfaRecoveryCodesIV",
    "mfaRecoveryCodesTag",
    "mfaRecoveryCodesCount"
  ];

  user.isMfaEnabled = false;

  for (const prop of propertiesToDelete) {
    if (user.hasOwnProperty(prop)) { // eslint-disable-line no-prototype-builtins
      user[prop] = undefined;
    }
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeMfaRecoveryCodes = (user: any) => {
  const propertiesToDelete = [
    "mfaRecoveryCodesCipherText",
    "mfaRecoveryCodesIV",
    "mfaRecoveryCodesTag",
    "mfaRecoveryCodesCount"
  ];

  user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.MFA_RECOVERY_CODES);

  // this ensures we can set the code count to undefined (ie. for the last code remaining)
  for (const prop of propertiesToDelete) { 
    if (user.hasOwnProperty(prop)) { // eslint-disable-line no-prototype-builtins
      user[prop] = undefined;
    }
  }
};
