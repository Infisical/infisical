import { z } from "zod";

import { passwordSchema } from "@app/components/utilities/checks/password/passwordPolicy";

export const adminSignUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().optional(),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password")
  })
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export type AdminSignUpFormData = z.infer<typeof adminSignUpSchema>;
