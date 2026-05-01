import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreateGatewayPamResourceSchema,
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdateGatewayPamResourceSchema,
  BaseUpdatePamAccountSchema
} from "../pam-resource-schemas";
import { KubernetesAuthMethod } from "./kubernetes-resource-enums";

export const BaseKubernetesResourceSchema = BasePamResourceSchema.extend({
  resourceType: z.literal(PamResource.Kubernetes)
});

export const KubernetesResourceListItemSchema = z.object({
  name: z.literal("Kubernetes"),
  resource: z.literal(PamResource.Kubernetes)
});

export const KubernetesResourceConnectionDetailsSchema = z.object({
  url: z.string().url().trim().max(500),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const KubernetesServiceAccountTokenCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken),
  serviceAccountToken: z.string().trim().max(10000)
});

export const KubernetesGatewayAuthCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.GatewayKubernetesAuth),
  namespace: z.string().trim().min(1).max(63),
  serviceAccountName: z.string().trim().min(1).max(253)
});

export const KubernetesAccountCredentialsSchema = z.discriminatedUnion("authMethod", [
  KubernetesServiceAccountTokenCredentialsSchema,
  KubernetesGatewayAuthCredentialsSchema
]);

export const KubernetesResourceSchema = BaseKubernetesResourceSchema.extend({
  connectionDetails: KubernetesResourceConnectionDetailsSchema,
  rotationAccountCredentials: KubernetesAccountCredentialsSchema.nullable().optional()
});

export const SanitizedKubernetesResourceSchema = BaseKubernetesResourceSchema.extend({
  connectionDetails: KubernetesResourceConnectionDetailsSchema,
  rotationAccountCredentials: z
    .discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken)
      }),
      z.object({
        authMethod: z.literal(KubernetesAuthMethod.GatewayKubernetesAuth),
        namespace: z.string(),
        serviceAccountName: z.string()
      })
    ])
    .nullable()
    .optional()
});

export const CreateKubernetesResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: KubernetesResourceConnectionDetailsSchema,
  rotationAccountCredentials: KubernetesAccountCredentialsSchema.nullable().optional()
});

export const UpdateKubernetesResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: KubernetesResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: KubernetesAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const KubernetesAccountSchema = BasePamAccountSchema.extend({
  credentials: KubernetesAccountCredentialsSchema
});

export const CreateKubernetesAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: KubernetesAccountCredentialsSchema
});

export const UpdateKubernetesAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: KubernetesAccountCredentialsSchema.optional()
});

export const SanitizedKubernetesAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  parentType: z.literal(PamResource.Kubernetes),
  credentials: z.discriminatedUnion("authMethod", [
    z.object({
      authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken)
    }),
    z.object({
      authMethod: z.literal(KubernetesAuthMethod.GatewayKubernetesAuth),
      namespace: z.string(),
      serviceAccountName: z.string()
    })
  ])
});

// Sessions
export const KubernetesSessionCredentialsSchema = KubernetesResourceConnectionDetailsSchema.and(
  KubernetesAccountCredentialsSchema
);
