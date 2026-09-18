import ms from "ms";
import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const GCP_IAM_CUSTOM_RENDERER_REASONS = [
  "repeatable-fields",
  "context-aware-fields"
] as const;

const validateGcpTtl = (value: string, context: z.RefinementCtx) => {
  if (!value) return;
  const valueMs = ms(value);
  if (valueMs === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid TTL format" });
    return;
  }
  if (valueMs < 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TTL must be a greater than 1 second"
    });
  }
  if (valueMs > 60 * 60 * 1000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 1 hour" });
  }
};

const gcpIamInputsSchema = z.object({
  serviceAccountEmail: z.string().email().trim().min(1, "Service account email required"),
  tokenScopes: z
    .array(z.object({ value: z.string().trim().min(1, "Scope is required") }))
    .min(1, "At least one scope is required")
});

export type TGcpIamFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof gcpIamInputsSchema>
>;

const makeGcpIamSchema = (isCreate: boolean) =>
  z
    .object({
      inputs: gcpIamInputsSchema,
      defaultTTL: z.string().superRefine(validateGcpTtl),
      maxTTL: z
        .string()
        .optional()
        .nullable()
        .superRefine((value, context) => {
          if (value) validateGcpTtl(value, context);
        }),
      name: z.string().refine((value) => value.toLowerCase() === value, "Must be lowercase"),
      environment: isCreate
        ? z.object({ name: z.string(), slug: z.string() })
        : z.object({ name: z.string(), slug: z.string() }).optional(),
      usernameTemplate: z.string().nullable().optional()
    })
    .refine((data) => !data.maxTTL || ms(data.maxTTL)! >= ms(data.defaultTTL)!, {
      path: ["maxTTL"],
      message: "Max TTL must be greater than or equal to Default TTL"
    });

export const gcpIamCreateFormSchema = makeGcpIamSchema(true) as z.ZodType<TGcpIamFormValues>;
export const gcpIamEditFormSchema = makeGcpIamSchema(false) as z.ZodType<TGcpIamFormValues>;

const DEFAULT_SCOPES = [
  { value: "https://www.googleapis.com/auth/iam" },
  { value: "https://www.googleapis.com/auth/cloud-platform" }
];

export const getGcpIamCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TGcpIamFormValues => ({
  name: "",
  defaultTTL: "30m",
  maxTTL: "1h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: { serviceAccountEmail: "", tokenScopes: DEFAULT_SCOPES }
});

export const getGcpIamEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TGcpIamFormValues => {
  const inputs = context.dynamicSecret.inputs as {
    serviceAccountEmail: string;
    tokenScopes?: string[];
  };
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    inputs: {
      serviceAccountEmail: inputs.serviceAccountEmail,
      tokenScopes: (inputs.tokenScopes ?? DEFAULT_SCOPES.map(({ value }) => value)).map(
        (value) => ({
          value
        })
      )
    }
  };
};

const normalizeInputs = (inputs: TGcpIamFormValues["inputs"]) => ({
  serviceAccountEmail: inputs.serviceAccountEmail,
  tokenScopes: [...new Set(inputs.tokenScopes.map(({ value }) => value))]
});

export const getGcpIamCreatePayload = (
  values: TGcpIamFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.GcpIam> => ({
  provider: { type: DynamicSecretProviders.GcpIam, inputs: normalizeInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getGcpIamEditPayload = (
  values: TGcpIamFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    inputs: normalizeInputs(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    defaultTTL: values.defaultTTL,
    maxTTL: values.maxTTL || undefined
  }
});
