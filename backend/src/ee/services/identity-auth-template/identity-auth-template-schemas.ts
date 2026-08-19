import { z } from "zod";

import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";
import {
  kubernetesHostSchema,
  superRefineKubernetesConnectionFields
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-validators";

import { TEMPLATE_VALIDATION_MESSAGES } from "./identity-auth-template-enums";

export const ldapTemplateFieldsSchema = z.object({
  url: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.URL_REQUIRED),
  bindDN: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.BIND_DN_REQUIRED),
  bindPass: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.BIND_PASSWORD_REQUIRED),
  searchBase: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.SEARCH_BASE_REQUIRED),
  ldapCaCertificate: z.string().trim().optional()
});

export const kubernetesTemplateFieldsBaseSchema = z.object({
  tokenReviewMode: z
    .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
    .default(IdentityKubernetesAuthTokenReviewMode.Api)
    .describe("The mode to use for token review. Must be one of: 'api', 'gateway'"),
  kubernetesHost: kubernetesHostSchema
    .nullish()
    .describe("The host string, host:port pair, or URL to the base of the Kubernetes API server"),
  caCert: z
    .string()
    .trim()
    .max(102400)
    .optional()
    .describe("The PEM-encoded CA certificate used to validate the Kubernetes API server's TLS certificate"),
  verifyTlsCertificate: z
    .boolean()
    .optional()
    .describe("Whether to verify the Kubernetes API server's TLS certificate against the configured CA certificate"),
  tokenReviewerJwt: z
    .string()
    .trim()
    .max(65536)
    .optional()
    .describe("Optional JWT token for accessing the Kubernetes TokenReview API"),
  gatewayId: z
    .string()
    .uuid()
    .nullish()
    .describe("The ID of the gateway to use when performing Kubernetes API requests"),
  gatewayPoolId: z
    .string()
    .uuid()
    .nullish()
    .describe("The ID of the gateway pool to use when performing Kubernetes API requests"),
  allowedAudience: z
    .string()
    .trim()
    .max(1000)
    .default("")
    .describe("The optional audience claim that service account JWT tokens must have to authenticate with Infisical")
});

export const kubernetesTemplateFieldsCreateSchema = kubernetesTemplateFieldsBaseSchema.superRefine(
  superRefineKubernetesConnectionFields
);

export const templateFieldPatchKeysByMethod = {
  ldap: Object.keys(ldapTemplateFieldsSchema.shape),
  kubernetes: Object.keys(kubernetesTemplateFieldsBaseSchema.shape)
} as const;
