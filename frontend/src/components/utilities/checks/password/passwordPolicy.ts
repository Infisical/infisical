import { z } from "zod";

import { TPasswordPolicy, TPasswordPolicyRequirement } from "@app/hooks/api/admin/types";

export const doesPasswordMeetRequirement = (
  password: string,
  requirement: TPasswordPolicyRequirement
) => {
  const matches = requirement.patterns.some((pattern) =>
    new RegExp(pattern, requirement.flags).test(password)
  );

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
