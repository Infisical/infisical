import { z } from "zod";

import { TPasswordPolicy, TPasswordPolicyRequirement } from "@app/hooks/api/admin/types";

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

export const doesPasswordMeetRequirement = (
  password: string,
  requirement: TPasswordPolicyRequirement
) => {
  const matches =
    requirement.patterns.some((pattern) => new RegExp(pattern, requirement.flags).test(password)) ||
    (requirement.maxConsecutiveCharacters !== undefined &&
      hasMoreThanMaxConsecutiveCharacters(password, requirement.maxConsecutiveCharacters));

  return matches === requirement.shouldMatch;
};

export const getPasswordRequirements = (password: string, policy: TPasswordPolicy) =>
  policy.requirements.map((requirement) => ({
    ...requirement,
    isMet: doesPasswordMeetRequirement(password, requirement)
  }));

export const createPasswordSchema = (policy: TPasswordPolicy) =>
  z
    .string()
    .min(1, "Password is required")
    .superRefine((password, context) => {
      policy.requirements.forEach((requirement) => {
        if (!doesPasswordMeetRequirement(password, requirement)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: requirement.message
          });
        }
      });
    });
