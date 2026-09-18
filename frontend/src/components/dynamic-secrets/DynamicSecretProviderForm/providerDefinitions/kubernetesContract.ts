import type { FieldValues } from "react-hook-form";
import { z } from "zod";

import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import type { VaultKubernetesRole } from "@app/hooks/api/migration/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import type {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormMode,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const KUBERNETES_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "repeatable-fields",
  "permission-aware-fields",
  "remote-options",
  "import-workflow"
] as const;

export enum KubernetesRoleType {
  ClusterRole = "cluster-role",
  Role = "role"
}

export enum KubernetesAuthMethod {
  Api = "api",
  Gateway = "gateway"
}

export const kubernetesCreateInputsSchema = z
  .discriminatedUnion("credentialType", [
    z.object({
      url: z.string().trim().optional(),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      credentialType: z.literal(KubernetesDynamicSecretCredentialType.Static),
      serviceAccountName: z.string().trim().min(1),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine(
          (value) => !value.includes(","),
          "Namespace must be a single value, not a comma-separated list"
        ),
      gatewayId: z.string().optional(),
      gatewayPoolId: z.string().optional(),
      audiences: z.array(z.string().trim().min(1)),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    }),
    z.object({
      url: z.string().trim().optional(),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      credentialType: z.literal(KubernetesDynamicSecretCredentialType.Dynamic),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine((value) => {
          const namespaces = value.split(",").map((namespace) => namespace.trim());
          return namespaces.length > 0 && namespaces.every((namespace) => namespace.length > 0);
        }, "Must be a valid comma-separated list of namespace values"),
      gatewayId: z.string().optional(),
      gatewayPoolId: z.string().optional(),
      audiences: z.array(z.string().trim().min(1)),
      roleType: z.nativeEnum(KubernetesRoleType),
      role: z.string().trim().min(1),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    })
  ])
  .superRefine((inputs, context) => {
    if (
      inputs.authMethod === KubernetesAuthMethod.Gateway &&
      !inputs.gatewayId &&
      !inputs.gatewayPoolId
    ) {
      context.addIssue({
        path: ["gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When auth method is set to Gateway, a gateway or gateway pool must be selected"
      });
    }

    if (inputs.authMethod === KubernetesAuthMethod.Api) {
      if (!inputs.clusterToken) {
        context.addIssue({
          path: ["clusterToken"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster token must be provided"
        });
      }

      if (!inputs.url) {
        context.addIssue({
          path: ["url"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster URL must be provided"
        });
      }
    }
  });

export const kubernetesEditInputsSchema = z
  .discriminatedUnion("credentialType", [
    z.object({
      url: z.string().trim().optional(),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().optional(),
      credentialType: z.literal(KubernetesDynamicSecretCredentialType.Static),
      serviceAccountName: z.string().trim().min(1),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine(
          (value) => !value.includes(","),
          "Namespace must be a single value, not a comma-separated list"
        ),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable(),
      audiences: z.array(z.string().trim().min(1)),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    }),
    z.object({
      url: z.string().trim().optional(),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().optional(),
      credentialType: z.literal(KubernetesDynamicSecretCredentialType.Dynamic),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine((value) => {
          const namespaces = value.split(",").map((namespace) => namespace.trim());
          return namespaces.length > 0 && namespaces.every((namespace) => namespace.length > 0);
        }, "Must be a valid comma-separated list of namespace values"),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable(),
      audiences: z.array(z.string().trim().min(1)),
      roleType: z.nativeEnum(KubernetesRoleType),
      role: z.string().trim().min(1),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    })
  ])
  .superRefine((inputs, context) => {
    if (
      inputs.authMethod === KubernetesAuthMethod.Gateway &&
      !inputs.gatewayId &&
      !inputs.gatewayPoolId
    ) {
      context.addIssue({
        path: ["gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When auth method is set to Gateway, a gateway or gateway pool must be selected"
      });
    }

    if (inputs.authMethod === KubernetesAuthMethod.Api) {
      if (!inputs.clusterToken) {
        context.addIssue({
          path: ["clusterToken"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster token must be provided"
        });
      }

      if (!inputs.url) {
        context.addIssue({
          path: ["url"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster URL must be provided"
        });
      }
    }
  });

export type TKubernetesFormInputs = {
  url?: string;
  clusterToken?: string;
  ca?: string;
  sslEnabled: boolean;
  sslRejectUnauthorized?: boolean;
  credentialType: KubernetesDynamicSecretCredentialType;
  serviceAccountName?: string;
  namespace: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  audiences: string[];
  roleType?: KubernetesRoleType;
  role?: string;
  authMethod: KubernetesAuthMethod;
};

export type TKubernetesFormValues = TDynamicSecretProviderFormValues<TKubernetesFormInputs> &
  FieldValues;

export const kubernetesCreateFormSchema = createDynamicSecretProviderFormSchema(
  kubernetesCreateInputsSchema,
  { usernameTemplateSchema: z.string().trim().optional() }
) as z.ZodType<TKubernetesFormValues>;

export const kubernetesEditFormSchema = editDynamicSecretProviderFormSchema(
  kubernetesEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().optional() }
) as z.ZodType<TKubernetesFormValues>;

export const getKubernetesCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TKubernetesFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    url: "",
    clusterToken: "",
    ca: "",
    sslEnabled: false,
    sslRejectUnauthorized: true,
    serviceAccountName: "",
    namespace: "",
    credentialType: KubernetesDynamicSecretCredentialType.Static,
    gatewayId: undefined,
    gatewayPoolId: undefined,
    audiences: [],
    roleType: KubernetesRoleType.ClusterRole,
    authMethod: KubernetesAuthMethod.Api
  }
});

export const normalizeKubernetesGatewayValueForMode = (
  mode: TDynamicSecretProviderFormMode,
  value: string | null
) => (mode === "create" ? (value ?? undefined) : value);

export const getKubernetesEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TKubernetesFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  maxTTL: context.dynamicSecret.maxTTL,
  inputs: context.dynamicSecret.inputs as TKubernetesFormInputs
});

type TKubernetesVaultImportInputs = {
  url: string;
  ca?: string;
  sslEnabled?: true;
  credentialType?: KubernetesDynamicSecretCredentialType;
  serviceAccountName?: string;
  namespace?: string;
  role?: string;
  roleType?: KubernetesRoleType;
  audiences?: string[];
};

export const getKubernetesVaultImportValues = (role: VaultKubernetesRole) => {
  const inputs: TKubernetesVaultImportInputs = { url: role.config.kubernetes_host };

  if (role.config.kubernetes_ca_cert) {
    inputs.ca = role.config.kubernetes_ca_cert;
    inputs.sslEnabled = true;
  }

  if (role.service_account_name) {
    inputs.credentialType = KubernetesDynamicSecretCredentialType.Static;
    inputs.serviceAccountName = role.service_account_name;
    if (role.allowed_kubernetes_namespaces?.length) {
      [inputs.namespace] = role.allowed_kubernetes_namespaces;
    }
  } else if (role.kubernetes_role_name) {
    inputs.credentialType = KubernetesDynamicSecretCredentialType.Dynamic;
    inputs.role = role.kubernetes_role_name;
    inputs.roleType =
      role.kubernetes_role_type === "ClusterRole"
        ? KubernetesRoleType.ClusterRole
        : KubernetesRoleType.Role;
    if (role.allowed_kubernetes_namespaces?.length) {
      inputs.namespace = role.allowed_kubernetes_namespaces.join(", ");
    }
  }

  if (role.token_default_audiences?.length) {
    inputs.audiences = role.token_default_audiences;
  }

  return {
    name: role.name,
    defaultTTL: role.token_default_ttl ? `${role.token_default_ttl}s` : undefined,
    maxTTL: role.token_max_ttl ? `${role.token_max_ttl}s` : undefined,
    inputs
  };
};

export const getKubernetesCreatePayload = (
  values: TKubernetesFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Kubernetes> => {
  const inputs = kubernetesCreateInputsSchema.parse(values.inputs);

  return {
    provider: {
      type: DynamicSecretProviders.Kubernetes,
      inputs: { ...inputs, url: inputs.url || undefined }
    },
    maxTTL: values.maxTTL ?? undefined,
    name: values.name,
    path: context.secretPath,
    defaultTTL: values.defaultTTL,
    projectSlug: context.projectSlug,
    environmentSlug: values.environment?.slug ?? "",
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
  };
};

export const getKubernetesEditPayload = (
  values: TKubernetesFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => {
  const inputs = kubernetesEditInputsSchema.parse(values.inputs);

  return {
    name: context.dynamicSecret.name,
    path: context.secretPath,
    projectSlug: context.projectSlug,
    environmentSlug: context.environment,
    data: {
      inputs: { ...inputs, url: inputs.url || undefined },
      newName: values.name === context.dynamicSecret.name ? undefined : values.name,
      defaultTTL: values.defaultTTL,
      maxTTL: values.maxTTL ?? undefined,
      usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
    }
  };
};
