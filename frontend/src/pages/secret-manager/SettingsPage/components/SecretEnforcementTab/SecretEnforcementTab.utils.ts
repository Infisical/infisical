import { z } from "zod";

export const staticSecretRuleSchema = z.object({
  enabled: z.boolean().default(true),
  folderPath: z.string().default("/**"),
  environment: z.string().default(""),
  keyPattern: z.object({
    enabled: z.boolean().default(false),
    pattern: z.string().default("*")
  }),
  valueRequirements: z.object({
    minLength: z.coerce.number().min(0).optional(),
    maxLength: z.coerce.number().min(0).optional(),
    minLowercase: z.coerce.number().min(0).optional(),
    minUppercase: z.coerce.number().min(0).optional(),
    minDigits: z.coerce.number().min(0).optional(),
    minSymbols: z.coerce.number().min(0).optional(),
    allowedSpecialChars: z.string().optional()
  })
});

export const secretEnforcementFormSchema = z.object({
  staticSecrets: z.array(staticSecretRuleSchema)
});

export type TSecretEnforcementForm = z.infer<typeof secretEnforcementFormSchema>;
export type TStaticSecretRule = z.infer<typeof staticSecretRuleSchema>;

export const DEFAULT_STATIC_SECRET_RULE: TStaticSecretRule = {
  enabled: true,
  folderPath: "/**",
  environment: "",
  keyPattern: {
    enabled: false,
    pattern: "*"
  },
  valueRequirements: {}
};
