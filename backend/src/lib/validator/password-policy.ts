import { z } from "zod";

import { BadRequestError } from "../errors";

// Keep this policy aligned with frontend/src/components/utilities/checks/password/passwordPolicy.ts.
const letterCharacterRegex = /\p{L}/u;
const numberOrSpecialCharacterRegex = /[\d!@#$%^&*(),.?":{}|<>]|[^\p{L}\p{N}\s]/u;
const repeatedCharacterRegex = /(.)\1\1\1|\s{4,}/;
const escapeCharacterRegex = /[\n\t\r\\]/;
const lowEntropyRegexes = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /(?:(?:https?|ftp):\/\/)?(?:\w+\.)?[a-zA-Z0-9.-]+\.(?:com|org|net|edu)(?:\/\S*)?(?:\?\S*)?/,
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/
];

export const PasswordPolicySchema = z
  .string()
  .min(10, "Password must contain at least 10 characters")
  .max(100, "Password must contain at most 100 characters")
  .regex(letterCharacterRegex, "Password must contain at least 1 letter")
  .regex(numberOrSpecialCharacterRegex, "Password must contain at least 1 number or special character")
  .refine((password) => !repeatedCharacterRegex.test(password), {
    message: "Password cannot contain more than 3 repeated consecutive characters"
  })
  .refine((password) => !escapeCharacterRegex.test(password), {
    message: "Password cannot contain escape characters"
  })
  .refine((password) => !lowEntropyRegexes.some((regex) => regex.test(password)), {
    message: "Password cannot contain an email address, URL, or social security number"
  });

export const validatePasswordPolicy = (password: string) => {
  const result = PasswordPolicySchema.safeParse(password);

  if (!result.success) {
    throw new BadRequestError({
      name: "Password policy validation",
      message: result.error.issues[0]?.message ?? "Password does not meet the password policy"
    });
  }

  return result.data;
};
