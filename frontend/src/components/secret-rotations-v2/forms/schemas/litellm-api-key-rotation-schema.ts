import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for the key name (matches backend schema). */
const LITELLM_API_KEY_NAME_MAX_LENGTH = 100;

/** Options owned by Infisical or set via dedicated fields; users cannot set these via the additional options JSON. */
const LITELLM_RESERVED_KEY_OPTIONS = [
  "key_alias",
  "auto_rotate",
  "rotation_interval",
  "duration",
  "send_invite_email",
  "key_type",
  "user_id",
  "team_id",
  "models"
];

export const LiteLLMApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.LiteLLMApiKey),
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1, "Key name required")
        .max(
          LITELLM_API_KEY_NAME_MAX_LENGTH,
          `Key name must be ${LITELLM_API_KEY_NAME_MAX_LENGTH} characters or fewer`
        ),
      additionalOptions: z
        .string()
        .trim()
        .optional()
        .superRefine((val, ctx) => {
          if (!val) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(val);
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Additional options must be valid JSON."
            });
            return;
          }

          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Additional options must be a JSON object."
            });
            return;
          }

          const reservedKeys = Object.keys(parsed).filter((key) =>
            LITELLM_RESERVED_KEY_OPTIONS.includes(key)
          );
          if (reservedKeys.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `The following options are managed by Infisical and cannot be set: ${reservedKeys.join(", ")}.`
            });
          }
        }),
      userId: z.string().trim().optional(),
      teamId: z.string().trim().optional(),
      models: z.array(z.string().trim()).optional()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
