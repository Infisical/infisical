import { z } from "zod";

import { SecretNameSchema } from "@app/lib/schemas";

import { PasswordRequirementsSchema } from "./password-requirements-schema";

export const SqlCredentialsRotationSchema = z.object({
  parameters: z.object({
    username1: z.string().trim().min(1, "Database Username 1 Required"),
    username2: z.string().trim().min(1, "Database Username 2 Required"),
    rotationStatement: z.string().trim().min(1).optional(),
    passwordRequirements: PasswordRequirementsSchema.optional()
  }),
  secretsMapping: z.object({
    username: SecretNameSchema,
    password: SecretNameSchema
  })
});
