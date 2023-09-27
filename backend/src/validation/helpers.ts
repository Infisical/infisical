import { z } from "zod";
import { MfaMethod } from "../models";

// TODO: import global frozen variables instead of hard-coding str lengths

export const validateMfaAuthAppTotp = z
  .string()
  .trim()
  .refine((val) => /^[0-9]{6}$/.test(val), {
    message: "Two-factor code is invalid.",
});

export const validateMfaAuthAppSecretKey = z.string()
  .trim()
  .refine((val) => /^[A-Z2-7]{32}$/.test(val), {
    message: "Two-factor secret key is invalid.",
});

export const validateMfaRecoveryCode = z.string()
  .trim()
  .refine((val) => {
    if (val.length !== 11 || val[5] !== "-") {
      return false;
    }

    const noHyphen = val.replace("-", "");
    return /^[A-Z2-7]+$/.test(noHyphen);
  }, {
    message: "MFA Recovery code is invalid.",
});

// can't set MFA recovery codes as a preference (these should only be used if the user cannot access their device, not as a default MFA method)
const mfaMethodValues = [
  MfaMethod.EMAIL,
  MfaMethod.AUTH_APP,
];

const validateMfaMethod = (value: string): value is MfaMethod => {
  return mfaMethodValues.includes(value as MfaMethod);
};

export const validateMfaPreference = z.string()
  .refine(validateMfaMethod, {
    message: "Invalid MFA preference.",
});