import { z } from "zod";

import {
  escapeCharRegex,
  letterCharRegex,
  lowEntropyRegexes,
  numAndSpecialCharRegex,
  repeatedCharRegex
} from "./passwordRegexes";

export const PASSWORD_REQUIREMENTS = [
  {
    code: "minLength",
    message: "At least 14 characters",
    isPrimary: true,
    test: (value: string) => value.length >= 14
  },
  {
    code: "maxLength",
    message: "At most 100 characters",
    isPrimary: false,
    test: (value: string) => value.length <= 100
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
  .min(14, PASSWORD_REQUIREMENTS[0].message)
  .max(100, PASSWORD_REQUIREMENTS[1].message)
  .regex(letterCharRegex, PASSWORD_REQUIREMENTS[2].message)
  .regex(numAndSpecialCharRegex, PASSWORD_REQUIREMENTS[3].message)
  .refine((password) => !repeatedCharRegex.test(password), PASSWORD_REQUIREMENTS[4].message)
  .refine((password) => !escapeCharRegex.test(password), PASSWORD_REQUIREMENTS[5].message)
  .refine(
    (password) => !lowEntropyRegexes.some((regex) => regex.test(password)),
    PASSWORD_REQUIREMENTS[6].message
  );
