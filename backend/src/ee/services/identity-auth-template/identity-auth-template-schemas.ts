import { z } from "zod";

import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";
import {
  kubernetesHostSchema,
  superRefineKubernetesConnectionFields
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-validators";
import { formatOidcAudiences } from "@app/services/identity-oidc-auth/identity-oidc-auth-validators";

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

export const oidcTemplateFieldsSchema = z.object({
  oidcDiscoveryUrl: z
    .string()
    .trim()
    .url()
    .min(1, TEMPLATE_VALIDATION_MESSAGES.OIDC.DISCOVERY_URL_REQUIRED)
    .max(2048)
    // the login flow appends the suffix itself, so a URL stored with it would fetch
    // <url>/.well-known/openid-configuration/.well-known/openid-configuration and fail
    // at every login; the identity attach route predates this check, but a template is
    // authored once and copied everywhere, so it must not store the broken form
    .refine(
      (val) => !val.endsWith("/.well-known/openid-configuration"),
      TEMPLATE_VALIDATION_MESSAGES.OIDC.DISCOVERY_URL_WELL_KNOWN_SUFFIX
    )
    .describe("The URL used to retrieve the OpenID Connect configuration from the identity provider"),
  boundIssuer: z
    .string()
    .trim()
    .min(1, TEMPLATE_VALIDATION_MESSAGES.OIDC.ISSUER_REQUIRED)
    .max(2048)
    .describe("The unique identifier of the identity provider issuing the JWT"),
  // same normalization as the identity attach route, bounded because a template is a new
  // contract (the shared validator is unbounded only for the pre-existing identity routes)
  boundAudiences: z
    .string()
    .trim()
    .max(2048)
    .default("")
    .transform(formatOidcAudiences)
    .describe("The comma-separated list of intended recipients that JWT tokens must have in their aud claim"),
  caCert: z
    .string()
    .trim()
    .max(102400)
    .optional()
    .describe("The PEM-encoded CA certificate used to validate the identity provider's TLS certificate")
});

// response shapes: each write-only credential is replaced by a boolean presence flag,
// mirroring $redactTemplateSecrets. Derived from the request schemas so a new template
// field cannot reach the API undocumented, and so the response serializer drops anything
// the redaction step misses
// Older releases stored raw partial LDAP patches, so existing rows may legitimately omit
// fields that are required when creating a template. Keep reads tolerant so one such row
// cannot fail an entire list response.
export const ldapTemplateFieldsResponseSchema = ldapTemplateFieldsSchema
  .omit({ bindPass: true })
  .partial()
  .extend({
    hasBindPass: z.boolean().describe("Whether a bind password is stored for this template")
  });

export const kubernetesTemplateFieldsResponseSchema = kubernetesTemplateFieldsBaseSchema
  .omit({ tokenReviewerJwt: true })
  .extend({
    hasTokenReviewerJwt: z.boolean().describe("Whether a token reviewer JWT is stored for this template")
  });

// OIDC templates hold no write-only credentials, so the response is the stored shape;
// audiences are re-declared as a plain string so the response schema carries no transform
export const oidcTemplateFieldsResponseSchema = oidcTemplateFieldsSchema.extend({
  boundAudiences: z
    .string()
    .default("")
    .describe("The comma-separated list of intended recipients that JWT tokens must have in their aud claim")
});

export const templateFieldPatchKeysByMethod = {
  ldap: Object.keys(ldapTemplateFieldsSchema.shape),
  kubernetes: Object.keys(kubernetesTemplateFieldsBaseSchema.shape),
  oidc: Object.keys(oidcTemplateFieldsSchema.shape)
} as const;
