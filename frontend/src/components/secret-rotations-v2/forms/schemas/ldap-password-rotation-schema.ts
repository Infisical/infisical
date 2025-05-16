import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/helpers/string";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { LdapPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";

export const LdapPasswordRotationSchema = z
  .object({
    type: z.literal(SecretRotation.LdapPassword),
    parameters: z.object({
      dn: z
        .string()
        .trim()
        .min(1, "DN/UPN required")
        .refine(
          (value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value),
          {
            message: "Invalid DN/UPN format"
          }
        ),
      passwordRequirements: PasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(LdapPasswordRotationMethod).optional()
    }),
    secretsMapping: z.object({
      dn: z.string().trim().min(1, "DN/UPN required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().min(1, "Password required")
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
