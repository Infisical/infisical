import { z } from "zod";

import {
  DynamicSecretProviders,
  NamespaceAuthType,
  TDynamicSecretOidcFederation,
  TDynamicSecretProvider,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  editDynamicSecretProviderFormSchema
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const NAMESPACE_DEFAULT_AUDIENCE = "https://federation.namespaceapis.com";

export const NAMESPACE_CUSTOM_RENDERER_REASONS = ["conditional-fields"] as const;

const NAMESPACE_INGRESS_GRANT =
  '{"resource_type":"ingress","resource_id":"*","actions":["access"]}';

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const namespaceTrustRelationshipCommand = ({
  issuerUrl,
  subject,
  audience
}: TDynamicSecretOidcFederation) =>
  [
    "nsc auth trust-relationships add",
    `--issuer ${shellQuote(issuerUrl ?? "<issuer-url>")}`,
    `--subject_match ${shellQuote(subject)}`,
    `--audience ${shellQuote(audience)}`,
    `--grant ${shellQuote(NAMESPACE_INGRESS_GRANT)}`,
    "--maximum_token_duration 86400s"
  ].join(" \\\n  ");

type TNamespaceInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.Namespace }
>["inputs"];

// hasStoredProvisionerToken is never sent: a blank token on edit keeps the stored one only if there is one
const namespaceInputsSchema = z
  .object({
    method: z.nativeEnum(NamespaceAuthType),
    tenantId: z.string().trim().max(256),
    audience: z
      .string()
      .trim()
      .max(512)
      .regex(/^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/, "Audience may only contain URL characters")
      .optional(),
    provisionerToken: z.string().trim().max(4096).optional(),
    hasStoredProvisionerToken: z.boolean()
  })
  .superRefine((inputs, context) => {
    if (inputs.method === NamespaceAuthType.Federation) {
      if (!inputs.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenantId"],
          message: "Tenant ID is required"
        });
      } else if (!inputs.tenantId.startsWith("tenant_")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenantId"],
          message: "Tenant ID must be a Namespace tenant ID (tenant_...)"
        });
      }
      return;
    }
    if (inputs.provisionerToken && !inputs.provisionerToken.startsWith("nsrt_")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provisionerToken"],
        message: "Provisioner token must be a Namespace revokable token (nsrt_...)"
      });
    }
    if (!inputs.provisionerToken && !inputs.hasStoredProvisionerToken) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provisionerToken"],
        message: "Provisioner token is required"
      });
    }
  });

export type TNamespaceFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof namespaceInputsSchema>
>;

export const namespaceCreateFormSchema = createDynamicSecretProviderFormSchema(
  namespaceInputsSchema
) as z.ZodType<TNamespaceFormValues>;

export const namespaceEditFormSchema = editDynamicSecretProviderFormSchema(
  namespaceInputsSchema
) as z.ZodType<TNamespaceFormValues>;

const buildInputs = (inputs: TNamespaceFormValues["inputs"]): TNamespaceInputs => {
  if (inputs.method === NamespaceAuthType.Federation) {
    return {
      method: NamespaceAuthType.Federation,
      tenantId: inputs.tenantId,
      audience: inputs.audience || NAMESPACE_DEFAULT_AUDIENCE
    };
  }
  return {
    method: NamespaceAuthType.ProvisionerToken,
    ...(inputs.provisionerToken ? { provisionerToken: inputs.provisionerToken } : {})
  };
};

export const getNamespaceCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TNamespaceFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    method: NamespaceAuthType.Federation,
    tenantId: "",
    audience: NAMESPACE_DEFAULT_AUDIENCE,
    provisionerToken: "",
    hasStoredProvisionerToken: false
  }
});

export const getNamespaceEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TNamespaceFormValues => {
  const inputs = context.dynamicSecret.inputs as Partial<
    Omit<Extract<TNamespaceInputs, { method: NamespaceAuthType.Federation }>, "method">
  > & { method: NamespaceAuthType };
  const { method } = inputs;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    inputs: {
      method,
      tenantId: inputs.tenantId ?? "",
      audience: inputs.audience ?? NAMESPACE_DEFAULT_AUDIENCE,
      provisionerToken: "",
      hasStoredProvisionerToken: method === NamespaceAuthType.ProvisionerToken
    }
  };
};

export const getNamespaceCreatePayload = (
  values: TNamespaceFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Namespace> => ({
  provider: { type: DynamicSecretProviders.Namespace, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getNamespaceEditPayload = (
  values: TNamespaceFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || null,
    defaultTTL: values.defaultTTL,
    inputs: buildInputs(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
