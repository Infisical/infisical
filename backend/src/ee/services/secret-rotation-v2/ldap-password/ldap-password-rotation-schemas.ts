import RE2 from "re2";
import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import { DistinguishedNameRegex } from "@app/lib/regex";
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
    .regex(new RE2(DistinguishedNameRegex), "Invalid DN format, ie; CN=user,OU=users,DC=example,DC=com")
    .min(1, "Distinguished Name (DN) Required")
    .describe(SecretRotations.PARAMETERS.LDAP_PASSWORD.dn),
  passwordRequirements: PasswordRequirementsSchema.optional()
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

export const CreateLdapPasswordRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.LdapPassword).extend({
  parameters: LdapPasswordRotationParametersSchema,
  secretsMapping: LdapPasswordRotationSecretsMappingSchema
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
