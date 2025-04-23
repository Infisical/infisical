import RE2 from "re2";
import { z } from "zod";

import { SecretRotations } from "@app/lib/api-docs";

export const PasswordRequirementsSchema = z
  .object({
    length: z
      .number()
      .min(1, "Password length must be a positive number")
      .max(250, "Password length must be less than 250")
      .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.length),
    required: z.object({
      digits: z
        .number()
        .min(0, "Digit count must be non-negative")
        .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.required.digits),
      lowercase: z
        .number()
        .min(0, "Lowercase count must be non-negative")
        .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.required.lowercase),
      uppercase: z
        .number()
        .min(0, "Uppercase count must be non-negative")
        .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.required.uppercase),
      symbols: z
        .number()
        .min(0, "Symbol count must be non-negative")
        .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.required.symbols)
    }),
    allowedSymbols: z
      .string()
      .regex(new RE2("[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?~]"), "Invalid symbols")
      .optional()
      .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.allowedSymbols)
  })
  .refine((data) => {
    return Object.values(data.required).some((count) => count > 0);
  }, "At least one character type must be required")
  .refine((data) => {
    const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
    return total <= data.length;
  }, "Sum of required characters cannot exceed the total length")
  .describe(SecretRotations.PARAMETERS.GENERAL.PASSWORD_REQUIREMENTS.base);
