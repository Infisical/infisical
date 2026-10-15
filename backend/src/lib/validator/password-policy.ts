import RE2 from "re2";
import { z } from "zod";

export const PasswordPolicyRequirementSchema = z.object({
  code: z.string(),
  message: z.string(),
  validationMessage: z.string(),
  isPrimary: z.boolean(),
  patterns: z.string().array().min(1),
  flags: z.string().optional(),
  maxConsecutiveCharacters: z.number().int().positive().optional(),
  shouldMatch: z.boolean()
});

export const PasswordPolicyConfigSchema = z.object({
  requirements: PasswordPolicyRequirementSchema.array().min(1)
});

export type TPasswordPolicyRequirement = z.infer<typeof PasswordPolicyRequirementSchema>;
export type TPasswordPolicyConfig = z.infer<typeof PasswordPolicyConfigSchema>;

const MINIMUM_LENGTH_REQUIREMENT = {
  code: "minimumLength",
  patterns: [String.raw`^[\s\S]{14,}$`],
  flags: "u",
  shouldMatch: true,
  message: "At least 14 characters",
  validationMessage: "Password must contain at least 14 characters",
  isPrimary: true
} as const satisfies TPasswordPolicyRequirement;

const MAXIMUM_LENGTH_REQUIREMENT = {
  code: "maximumLength",
  patterns: [String.raw`^[\s\S]{0,100}$`],
  flags: "u",
  shouldMatch: true,
  message: "At most 100 characters",
  validationMessage: "Password must contain at most 100 characters",
  isPrimary: false
} as const satisfies TPasswordPolicyRequirement;

const LETTER_REQUIREMENT = {
  code: "letter",
  patterns: [String.raw`\p{L}`],
  flags: "u",
  shouldMatch: true,
  message: "At least 1 letter",
  validationMessage: "Password must contain at least 1 letter",
  isPrimary: true
} as const satisfies TPasswordPolicyRequirement;

const NUMBER_OR_SPECIAL_REQUIREMENT = {
  code: "numberOrSpecial",
  patterns: [String.raw`[\d!@#$%^&*(),.?":{}|<>]|[^\p{L}\p{N}\s]`],
  flags: "u",
  shouldMatch: true,
  message: "At least 1 number or special character",
  validationMessage: "Password must contain at least 1 number or special character",
  isPrimary: true
} as const satisfies TPasswordPolicyRequirement;

const REPEATED_CHARACTERS_REQUIREMENT = {
  code: "repeatedCharacters",
  patterns: [String.raw`\s{4,}`],
  maxConsecutiveCharacters: 3,
  shouldMatch: false,
  message: "No more than 3 repeated consecutive characters",
  validationMessage: "Password cannot contain more than 3 repeated consecutive characters",
  isPrimary: false
} as const satisfies TPasswordPolicyRequirement;

const ESCAPE_CHARACTERS_REQUIREMENT = {
  code: "escapeCharacters",
  patterns: [String.raw`[\n\t\r\\]`],
  shouldMatch: false,
  message: "No escape characters",
  validationMessage: "Password cannot contain escape characters",
  isPrimary: false
} as const satisfies TPasswordPolicyRequirement;

export const PASSWORD_POLICY = {
  requirements: [
    MINIMUM_LENGTH_REQUIREMENT,
    MAXIMUM_LENGTH_REQUIREMENT,
    LETTER_REQUIREMENT,
    NUMBER_OR_SPECIAL_REQUIREMENT,
    REPEATED_CHARACTERS_REQUIREMENT,
    ESCAPE_CHARACTERS_REQUIREMENT
  ]
} as const satisfies TPasswordPolicyConfig;

export const PKCS12_PASSWORD_POLICY = {
  requirements: [
    MINIMUM_LENGTH_REQUIREMENT,
    MAXIMUM_LENGTH_REQUIREMENT,
    LETTER_REQUIREMENT,
    {
      code: "number",
      patterns: [String.raw`\p{N}`],
      flags: "u",
      shouldMatch: true,
      message: "At least 1 number",
      validationMessage: "Password must contain at least 1 number",
      isPrimary: true
    },
    {
      code: "special",
      patterns: [String.raw`[^\p{L}\p{N}\s]`],
      flags: "u",
      shouldMatch: true,
      message: "At least 1 special character",
      validationMessage: "Password must contain at least 1 special character",
      isPrimary: true
    },
    REPEATED_CHARACTERS_REQUIREMENT,
    ESCAPE_CHARACTERS_REQUIREMENT
  ]
} as const satisfies TPasswordPolicyConfig;

const hasMoreThanMaxConsecutiveCharacters = (password: string, maxConsecutiveCharacters: number) => {
  let previousCharacter: string | undefined;
  let consecutiveCharacterCount = 0;

  return Array.from(password).some((character) => {
    if (character === previousCharacter) {
      consecutiveCharacterCount += 1;
    } else {
      previousCharacter = character;
      consecutiveCharacterCount = 1;
    }

    return consecutiveCharacterCount > maxConsecutiveCharacters;
  });
};

export const doesPasswordMeetRequirement = (password: string, requirement: TPasswordPolicyRequirement) => {
  const matches =
    requirement.patterns.some((pattern) => new RE2(pattern, requirement.flags).test(password)) ||
    (requirement.maxConsecutiveCharacters !== undefined &&
      hasMoreThanMaxConsecutiveCharacters(password, requirement.maxConsecutiveCharacters));

  return matches === requirement.shouldMatch;
};

export const createPasswordPolicySchema = (policy: TPasswordPolicyConfig) =>
  z.string().superRefine((password, context) => {
    policy.requirements.forEach((requirement) => {
      if (!doesPasswordMeetRequirement(password, requirement)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: requirement.validationMessage
        });
      }
    });
  });

export const PasswordPolicySchema = createPasswordPolicySchema(PASSWORD_POLICY);

export const Pkcs12PasswordSchema = createPasswordPolicySchema(PKCS12_PASSWORD_POLICY);
