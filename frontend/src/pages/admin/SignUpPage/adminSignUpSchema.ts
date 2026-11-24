import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";

export const createAdminSignUpSchema = (
  passwordPolicy: TPasswordPolicy,
  isActivationTokenRequired: boolean
) =>
  z
    .object({
      firstName: z.string().trim().min(1, "First name is required"),
      lastName: z.string().trim().optional(),
      email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password"),
      activationToken: isActivationTokenRequired
        ? z
            .string()
            .trim()
            .min(1, "Activation token is required")
            .max(256, "Activation token must be at most 256 characters")
        : z.string().trim().optional()
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

export type AdminSignUpFormData = z.infer<ReturnType<typeof createAdminSignUpSchema>>;
