import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

// iLO rejects longer passwords with iLO.2.43.InvalidPasswordLength, over both Redfish and SSH
export const HP_ILO_MAX_PASSWORD_LENGTH = 39;

export enum HpIloRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export const HpIloRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const HpIloRotationParametersSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .refine(
      (val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen, CharacterType.Underscore])(val),
      "Username can only contain alphanumeric characters, dashes, and underscores"
    )
    .describe(SecretRotations.PARAMETERS.HP_ILO.username),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotationMethod: z
    .nativeEnum(HpIloRotationMethod)
    .optional()
    .describe(SecretRotations.PARAMETERS.HP_ILO.rotationMethod),
  sslRejectUnauthorized: z.boolean().optional().describe(SecretRotations.PARAMETERS.HP_ILO.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(8192, "SSL certificate cannot exceed 8192 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(SecretRotations.PARAMETERS.HP_ILO.sslCertificate)
});

// Only input is narrowed: rotations saved before the limit existed may hold a longer length and must still read back
const HpIloRotationParametersInputSchema = HpIloRotationParametersSchema.extend({
  passwordRequirements: PasswordRequirementsSchema.refine(
    (requirements) => requirements.length <= HP_ILO_MAX_PASSWORD_LENGTH,
    {
      message: `Password length cannot exceed ${HP_ILO_MAX_PASSWORD_LENGTH} characters, the maximum HP iLO accepts`,
      path: ["length"]
    }
  )
    .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.base)
    .optional()
});

const HpIloRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.HP_ILO.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.HP_ILO.password)
});

export const HpIloRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});

export const HpIloRotationSchema = BaseSecretRotationSchema(SecretRotation.HpIloLocalAccount).extend({
  type: z.literal(SecretRotation.HpIloLocalAccount),
  parameters: HpIloRotationParametersSchema,
  secretsMapping: HpIloRotationSecretsMappingSchema
});

export const CreateHpIloRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.HpIloLocalAccount)
  .extend({
    parameters: HpIloRotationParametersInputSchema,
    secretsMapping: HpIloRotationSecretsMappingSchema,
    temporaryParameters: z
      .object({
        password: z.string().optional().describe(SecretRotations.PARAMETERS.HP_ILO.password)
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    if (val.parameters.rotationMethod === HpIloRotationMethod.LoginAsTarget && !val.temporaryParameters?.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required for initial rotation setup in login as target method",
        path: ["temporaryParameters", "password"]
      });
    }
  });

export const UpdateHpIloRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.HpIloLocalAccount).extend({
  parameters: HpIloRotationParametersInputSchema.optional(),
  secretsMapping: HpIloRotationSecretsMappingSchema.optional()
});

export const HpIloRotationListItemSchema = z.object({
  name: z.literal("HP iLO Local Account"),
  connection: z.literal(AppConnection.SSH),
  type: z.literal(SecretRotation.HpIloLocalAccount),
  template: HpIloRotationTemplateSchema
});
