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

export enum UnixLinuxLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export const UnixLinuxLocalAccountRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const UnixLinuxLocalAccountRotationParametersSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .refine(
      (val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen, CharacterType.Underscore])(val),
      "Name can only contain alphanumeric characters, dashes, underscores, and spaces"
    )
    .describe(SecretRotations.PARAMETERS.UNIX_LINUX_LOCAL_ACCOUNT.username),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotationMethod: z
    .nativeEnum(UnixLinuxLocalAccountRotationMethod)
    .optional()
    .describe(SecretRotations.PARAMETERS.UNIX_LINUX_LOCAL_ACCOUNT.rotationMethod)
});

const UnixLinuxLocalAccountRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.UNIX_LINUX_LOCAL_ACCOUNT.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.UNIX_LINUX_LOCAL_ACCOUNT.password)
});

export const UnixLinuxLocalAccountRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});

export const UnixLinuxLocalAccountRotationSchema = BaseSecretRotationSchema(SecretRotation.UnixLinuxLocalAccount).extend({
  type: z.literal(SecretRotation.UnixLinuxLocalAccount),
  parameters: UnixLinuxLocalAccountRotationParametersSchema,
  secretsMapping: UnixLinuxLocalAccountRotationSecretsMappingSchema
});

export const CreateUnixLinuxLocalAccountRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.UnixLinuxLocalAccount)
  .extend({
    parameters: UnixLinuxLocalAccountRotationParametersSchema,
    secretsMapping: UnixLinuxLocalAccountRotationSecretsMappingSchema,
    temporaryParameters: z
      .object({
        password: z.string().optional().describe(SecretRotations.PARAMETERS.UNIX_LINUX_LOCAL_ACCOUNT.password)
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    if (
      val.parameters.rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget &&
      !val.temporaryParameters?.password
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required for initial rotation setup in login as target method",
        path: ["temporaryParameters", "password"]
      });
    }
  });

export const UpdateUnixLinuxLocalAccountRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.UnixLinuxLocalAccount).extend({
  parameters: UnixLinuxLocalAccountRotationParametersSchema.optional(),
  secretsMapping: UnixLinuxLocalAccountRotationSecretsMappingSchema.optional()
});

export const UnixLinuxLocalAccountRotationListItemSchema = z.object({
  name: z.literal("Unix/Linux Local Account"),
  connection: z.literal(AppConnection.SSH),
  type: z.literal(SecretRotation.UnixLinuxLocalAccount),
  template: UnixLinuxLocalAccountRotationTemplateSchema
});
