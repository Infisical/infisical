import { z } from "zod";

import {
  escapeCharRegex,
  letterCharRegex,
  lowEntropyRegexes,
  numAndSpecialCharRegex,
  repeatedCharRegex
} from "./passwordRegexes";

// Keep this policy aligned with backend/src/lib/validator/password-policy.ts.
export const PASSWORD_POLICY_MIN_LENGTH = 10;
export const PASSWORD_POLICY_MAX_LENGTH = 100;

export const PASSWORD_REQUIREMENTS = [
  {
    code: "minLength",
    message: `At least ${PASSWORD_POLICY_MIN_LENGTH} characters`,
    isPrimary: true,
    test: (value: string) => value.length >= PASSWORD_POLICY_MIN_LENGTH
  },
  {
    code: "maxLength",
    message: `At most ${PASSWORD_POLICY_MAX_LENGTH} characters`,
    isPrimary: false,
    test: (value: string) => value.length <= PASSWORD_POLICY_MAX_LENGTH
  },
  {
    code: "letter",
    message: "At least 1 letter",
    isPrimary: true,
    test: (value: string) => letterCharRegex.test(value)
  },
  {
    code: "numberOrSpecial",
    message: "At least 1 number or special character",
    isPrimary: true,
    test: (value: string) => numAndSpecialCharRegex.test(value)
  },
  {
    code: "repeatedCharacters",
    message: "No more than 3 repeated consecutive characters",
    isPrimary: false,
    test: (value: string) => !repeatedCharRegex.test(value)
  },
  {
    code: "escapeCharacters",
    message: "No escape characters",
    isPrimary: false,
    test: (value: string) => !escapeCharRegex.test(value)
  },
  {
    code: "lowEntropy",
    message: "No email address, URL, or social security number",
    isPrimary: false,
    test: (value: string) => !lowEntropyRegexes.some((regex) => regex.test(value))
  }
] as const;

export const getPasswordRequirements = (password: string) =>
  PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    isMet: requirement.test(password)
  }));

export const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .min(PASSWORD_POLICY_MIN_LENGTH, PASSWORD_REQUIREMENTS[0].message)
  .max(PASSWORD_POLICY_MAX_LENGTH, PASSWORD_REQUIREMENTS[1].message)
  .regex(letterCharRegex, PASSWORD_REQUIREMENTS[2].message)
  .regex(numAndSpecialCharRegex, PASSWORD_REQUIREMENTS[3].message)
  .refine((password) => !repeatedCharRegex.test(password), PASSWORD_REQUIREMENTS[4].message)
  .refine((password) => !escapeCharRegex.test(password), PASSWORD_REQUIREMENTS[5].message)
  .refine(
    (password) => !lowEntropyRegexes.some((regex) => regex.test(password)),
    PASSWORD_REQUIREMENTS[6].message
  );
