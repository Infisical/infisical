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

export const PASSWORD_POLICY = {
  requirements: [
    {
      code: "minimumLength",
      patterns: [String.raw`^[\s\S]{14,}$`],
      flags: "u",
      shouldMatch: true,
      message: "At least 14 characters",
      validationMessage: "Password must contain at least 14 characters",
      isPrimary: true
    },
    {
      code: "maximumLength",
      patterns: [String.raw`^[\s\S]{0,100}$`],
      flags: "u",
      shouldMatch: true,
      message: "At most 100 characters",
      validationMessage: "Password must contain at most 100 characters",
      isPrimary: false
    },
    {
      code: "letter",
      patterns: [String.raw`\p{L}`],
      flags: "u",
      shouldMatch: true,
      message: "At least 1 letter",
      validationMessage: "Password must contain at least 1 letter",
      isPrimary: true
    },
    {
      code: "numberOrSpecial",
      patterns: [String.raw`[\d!@#$%^&*(),.?":{}|<>]|[^\p{L}\p{N}\s]`],
      flags: "u",
      shouldMatch: true,
      message: "At least 1 number or special character",
      validationMessage: "Password must contain at least 1 number or special character",
      isPrimary: true
    },
    {
      code: "repeatedCharacters",
      patterns: [String.raw`\s{4,}`],
      maxConsecutiveCharacters: 3,
      shouldMatch: false,
      message: "No more than 3 repeated consecutive characters",
      validationMessage: "Password cannot contain more than 3 repeated consecutive characters",
      isPrimary: false
    },
    {
      code: "escapeCharacters",
      patterns: [String.raw`[\n\t\r\\]`],
      shouldMatch: false,
      message: "No escape characters",
      validationMessage: "Password cannot contain escape characters",
      isPrimary: false
    }
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

export const PasswordPolicySchema = z.string().superRefine((password, context) => {
  PASSWORD_POLICY.requirements.forEach((requirement) => {
    if (!doesPasswordMeetRequirement(password, requirement)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: requirement.validationMessage
      });
    }
  });
});
