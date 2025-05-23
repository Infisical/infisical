import { z } from "zod";

import { LdapPasswordRotationMethod } from "@app/ee/services/secret-rotation-v2/ldap-password/ldap-password-rotation-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/lib/regex";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const LdapPasswordRotationGeneratedCredentialsSchema = z
  .object({
    dn: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const LdapPasswordRotationParametersSchema = z.object({
  dn: z
    .string()
    .trim()
    .min(1, "DN/UPN required")
    .refine((value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value), {
      message: "Invalid DN/UPN format"
    })
    .describe(SecretRotations.PARAMETERS.LDAP_PASSWORD.dn),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotationMethod: z
    .nativeEnum(LdapPasswordRotationMethod)
    .optional()
    .describe(SecretRotations.PARAMETERS.LDAP_PASSWORD.rotationMethod)
});

const LdapPasswordRotationSecretsMappingSchema = z.object({
  dn: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.LDAP_PASSWORD.dn),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.LDAP_PASSWORD.password)
});

export const LdapPasswordRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    dn: z.string(),
    password: z.string()
  })
});

export const LdapPasswordRotationSchema = BaseSecretRotationSchema(SecretRotation.LdapPassword).extend({
  type: z.literal(SecretRotation.LdapPassword),
  parameters: LdapPasswordRotationParametersSchema,
  secretsMapping: LdapPasswordRotationSecretsMappingSchema
});

export const CreateLdapPasswordRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.LdapPassword)
  .extend({
    parameters: LdapPasswordRotationParametersSchema,
    secretsMapping: LdapPasswordRotationSecretsMappingSchema,
    temporaryParameters: z
      .object({
        password: z.string().min(1, "Password required").describe(SecretRotations.PARAMETERS.LDAP_PASSWORD.password)
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    if (
      val.parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal &&
      !val.temporaryParameters?.password
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password required",
        path: ["temporaryParameters", "password"]
      });
    }
  });

export const UpdateLdapPasswordRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.LdapPassword).extend({
  parameters: LdapPasswordRotationParametersSchema.optional(),
  secretsMapping: LdapPasswordRotationSecretsMappingSchema.optional()
});

export const LdapPasswordRotationListItemSchema = z.object({
  name: z.literal("LDAP Password"),
  connection: z.literal(AppConnection.LDAP),
  type: z.literal(SecretRotation.LdapPassword),
  template: LdapPasswordRotationTemplateSchema
});
